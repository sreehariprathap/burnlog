'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import { ReceiptScanner } from './ReceiptScanner';

type LogTransactionModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

type TransactionType = 'income' | 'expense';

export function LogTransactionModal({ profileId, onClose, onSaved }: LogTransactionModalProps) {
  const supabase = createClientComponentClient();
  const [tab, setTab] = useState<'manual' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const handleSave = async () => {
    setError(null);
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('finance_transactions').insert([
        {
          profileId,
          type,
          category,
          label: label.trim(),
          amount: Number(amount),
          date: new Date(date).toISOString(),
          notes: notes.trim() || null,
        },
      ]);

      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
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
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="photo">Scan Receipt</TabsTrigger>
            </TabsList>
            <TabsContent value="photo" className="pt-3">
              <Button className="w-full gap-2" onClick={() => setShowScanner(true)}>
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="label">Label</Label>
                <Input id="label" placeholder="e.g. Whole Foods" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" placeholder="Any details" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
