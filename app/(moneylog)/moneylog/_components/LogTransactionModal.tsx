'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { Receipt, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemedButton } from '@/components/ui/themed-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import { StatementImportPanel } from './StatementImportPanel';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentProfile } from '@/lib/useCurrentProfile';

const ReceiptScanner = dynamic(() => import('./ReceiptScanner').then((mod) => mod.ReceiptScanner), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Loader2 className="size-6 animate-spin text-white" />
    </div>
  ),
});

type LogTransactionModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

type TransactionType = 'income' | 'expense';

export function LogTransactionModal({ profileId, onClose, onSaved }: LogTransactionModalProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile: currentProfile } = useCurrentProfile();
  const [tab, setTab] = useState<'manual' | 'photo' | 'import'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [importEnabled, setImportEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: toggle } = await supabase
        .from('adminlog_toggles')
        .select('key, type, globallyEnabled')
        .eq('key', 'feature:moneylog-ai-import')
        .maybeSingle();
      // A missing toggle row means no admin has turned this on yet — default closed,
      // unlike TopBar.tsx's app-toggle default-open rule, since this gates AI spend.
      if (!toggle) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: myProfile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!myProfile) return;

      const { data: override } = await supabase
        .from('adminlog_toggle_overrides')
        .select('enabled')
        .eq('toggleKey', 'feature:moneylog-ai-import')
        .eq('profileId', myProfile.id)
        .maybeSingle();

      setImportEnabled(override ? override.enabled : toggle.globallyEnabled);
    })();
  }, [supabase]);
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [customCategory, setCustomCategory] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategory(nextType === 'income' ? INCOME_CATEGORIES[0].value : EXPENSE_CATEGORIES[0].value);
  };

  const handleScanResult = (result: { merchant: string; amount: number; date: string; category: string; notes: string }) => {
    setType('expense');
    setLabel(result.merchant);
    setAmount(String(result.amount));
    setDate(result.date);
    setCategory(result.category);
    if (result.notes) setNotes(result.notes);
    setShowScanner(false);
    setTab('manual');
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLabelError(null);
    setAmountError(null);
    setCategoryError(null);

    const resolvedCategory = category === 'custom' ? customCategory.trim() : category;

    let hasError = false;
    if (!label.trim()) {
      setLabelError('Please enter a label');
      hasError = true;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError('Please enter a valid amount');
      hasError = true;
    }
    if (!resolvedCategory) {
      setCategoryError(category === 'custom' ? 'Please name your category' : 'Please choose a category');
      hasError = true;
    }
    if (hasError) return;

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('finance_transactions').insert([
        {
          profileId,
          type,
          category: resolvedCategory,
          label: label.trim(),
          amount: Number(amount),
          date: new Date(date).toISOString(),
          notes: notes.trim() || null,
        },
      ]);

      if (insertError) throw insertError;
      toast({ title: 'Transaction saved' });
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save transaction';
      toast({ title: 'Failed to save transaction', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (showScanner) {
    return <ReceiptScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Transaction</DrawerTitle>
        </DrawerHeader>
        <form className="px-4 pb-6 space-y-4 overflow-y-auto" onSubmit={handleSave}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo' | 'import')}>
            <TabsList className={importEnabled ? 'grid grid-cols-3' : 'grid grid-cols-2'}>
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="photo">Scan Receipt</TabsTrigger>
              {importEnabled && <TabsTrigger value="import">Import</TabsTrigger>}
            </TabsList>
            <TabsContent value="photo" className="pt-3">
              <Button type="button" className="w-full gap-2" onClick={() => setShowScanner(true)}>
                <Receipt className="h-4 w-4" />
                Scan Receipt Photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Take or upload a photo of a receipt — AI reads the merchant, amount and category, then you review and save below.
              </p>
            </TabsContent>
            <TabsContent value="manual" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={type === 'expense' ? 'default' : 'outline'}
                  onClick={() => handleTypeChange('expense')}
                >
                  Expense
                </Button>
                <Button
                  type="button"
                  variant={type === 'income' ? 'default' : 'outline'}
                  onClick={() => handleTypeChange('income')}
                >
                  Income
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background md:text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                  {category === 'custom' && (
                    <Input
                      placeholder="Category name"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                    />
                  )}
                  {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {amountError && <p className="text-sm text-destructive">{amountError}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  placeholder="e.g. Whole Foods"
                  autoComplete="off"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                {labelError && <p className="text-sm text-destructive">{labelError}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="Any details"
                  autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </TabsContent>
            {importEnabled && (
              <TabsContent value="import" className="pt-3">
                <StatementImportPanel
                  profileId={profileId}
                  isAdmin={Boolean(currentProfile?.isAdmin)}
                  onImported={() => {
                    setTab('manual');
                    onSaved();
                  }}
                />
              </TabsContent>
            )}
          </Tabs>

          {tab !== 'import' && (
            <ThemedButton slot="primary-cta" type="submit" disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save'}
            </ThemedButton>
          )}
        </form>
      </DrawerContent>
    </Drawer>
  );
}
