// app/(moneylog)/moneylog/_components/StatementImportPanel.tsx
'use client';

import { useRef, useState } from 'react';
import { Copy, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  buildStatementImportPrompt,
  parseStatementJson,
  type AccountType,
  type ParsedStatementTransaction,
} from '@/lib/moneylog/statementImportPrompt';

export type StatementImportPanelProps = {
  profileId: string;
  isAdmin: boolean;
  onImported: () => void;
};

type ReviewRow = ParsedStatementTransaction & { id: string };

type Step = 'form' | 'review';

function toReviewRows(transactions: ParsedStatementTransaction[]): ReviewRow[] {
  return transactions.map((t) => ({ ...t, id: crypto.randomUUID() }));
}

/** min/max of the scanned transaction dates — replaces the user's pre-scan guess once we know what the statement actually contains. */
function detectPeriod(transactions: ParsedStatementTransaction[]): { start: string; end: string } | null {
  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function StatementImportPanel({ profileId, isAdmin, onImported }: StatementImportPanelProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [bank, setBank] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('credit');
  const [periodStart, setPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [pastedJson, setPastedJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formInput = { bank, accountType, periodStart, periodEnd };

  const handlePdfFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      setExtractError('Please select a PDF file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setExtractError('PDF must be under 10 MB');
      return;
    }
    setExtractError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPdfBase64(e.target?.result as string);
      setPdfFilename(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!pdfBase64) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch('/api/ai/moneylog/import-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, filename: pdfFilename, ...formInput }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setExtractError(data.error ?? 'Failed to extract transactions');
        return;
      }
      setRows(toReviewRows(data.transactions));
      const detected = detectPeriod(data.transactions);
      if (detected) {
        setPeriodStart(detected.start);
        setPeriodEnd(detected.end);
      }
      setStep('review');
    } catch {
      setExtractError('Network error. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(buildStatementImportPrompt(formInput));
    toast({ description: 'Prompt copied — paste it into ChatGPT or Claude along with your statement PDF.' });
  };

  const handleParse = () => {
    setParseError(null);
    try {
      const transactions = parseStatementJson(pastedJson);
      setRows(toReviewRows(transactions));
      const detected = detectPeriod(transactions);
      if (detected) {
        setPeriodStart(detected.start);
        setPeriodEnd(detected.end);
      }
      setStep('review');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse that JSON');
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCancelReview = () => {
    setRows([]);
    setStep('form');
  };

  const handleConfirmImport = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('finance_transactions').insert(
        rows.map((r) => ({
          profileId,
          type: r.type,
          category: r.category,
          label: r.label,
          amount: r.amount,
          date: new Date(r.date).toISOString(),
          notes: r.notes || null,
        }))
      );
      if (error) throw error;
      toast({ title: `${rows.length} transaction${rows.length === 1 ? '' : 's'} imported` });
      setRows([]);
      setPastedJson('');
      setStep('form');
      onImported();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import transactions';
      toast({ title: 'Import failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Review {rows.length} transaction{rows.length === 1 ? '' : 's'}</p>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Statement period detected: {periodStart} to {periodEnd}
          </p>
        )}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {rows.map((row) => {
            const categories = row.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
            return (
              <div key={row.id} className="rounded-lg border border-border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(row.id, { date: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label="Remove row"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.type === 'expense' ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      onClick={() => updateRow(row.id, { type: 'expense', category: 'other_expense' })}
                    >
                      Expense
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.type === 'income' ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      onClick={() => updateRow(row.id, { type: 'income', category: 'other_income' })}
                    >
                      Income
                    </Button>
                  </div>
                  <select
                    value={row.category}
                    onChange={(e) => updateRow(row.id, { category: e.target.value })}
                    className="flex h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  value={row.label}
                  onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="Label"
                />
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No rows left — go back and paste JSON again.</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={handleCancelReview}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={rows.length === 0 || saving} onClick={handleConfirmImport}>
            {saving ? 'Importing...' : `Confirm Import (${rows.length})`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="import-period-start">From</Label>
          <Input id="import-period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-period-end">To</Label>
          <Input id="import-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="import-bank">Bank</Label>
          <Input id="import-bank" placeholder="e.g. Chase" value={bank} onChange={(e) => setBank(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-account-type">Account type</Label>
          <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
            <SelectTrigger id="import-account-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === 'manual' ? 'default' : 'outline'} className="flex-1" onClick={() => setMode('manual')}>
            Manual
          </Button>
          <Button type="button" size="sm" variant={mode === 'auto' ? 'default' : 'outline'} className="flex-1" onClick={() => setMode('auto')}>
            Auto (AI upload)
          </Button>
        </div>
      )}

      {mode === 'manual' || !isAdmin ? (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Manual</p>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleCopyPrompt}>
              <Copy className="h-3.5 w-3.5" />
              Copy Prompt
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste the copied prompt into ChatGPT or Claude along with your statement PDF, then paste its JSON reply below.
          </p>
          <Textarea
            value={pastedJson}
            onChange={(e) => setPastedJson(e.target.value)}
            placeholder='{"transactions": [...]}'
            rows={5}
            className="text-xs font-mono"
          />
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          <Button type="button" className="w-full" disabled={!pastedJson.trim() || !bank.trim()} onClick={handleParse}>
            Parse
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-sm font-medium">Auto (AI upload)</p>
          <p className="text-xs text-muted-foreground">Upload the statement PDF — AI extracts transactions directly.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePdfFile(e.target.files[0])}
          />
          <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {pdfFilename ?? 'Choose PDF'}
          </Button>
          {extractError && <p className="text-sm text-destructive">{extractError}</p>}
          <Button type="button" className="w-full gap-1.5" disabled={!pdfBase64 || !bank.trim() || extracting} onClick={handleExtract}>
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {extracting ? 'Extracting...' : 'Extract Transactions'}
          </Button>
        </div>
      )}
    </div>
  );
}
