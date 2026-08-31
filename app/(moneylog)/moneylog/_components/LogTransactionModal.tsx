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
import { useToast } from '@/components/ui/use-toast';

type LogTransactionModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

type TransactionType = 'income' | 'expense';

export function LogTransactionModal({ profileId, onClose, onSaved }: LogTransactionModalProps) {
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'manual' | 'photo'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
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

    let hasError = false;
    if (!label.trim()) {
      setLabelError('Please enter a label');
      hasError = true;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError('Please enter a valid amount');
      hasError = true;
    }
    if (!category) {
      setCategoryError('Please choose a category');
      hasError = true;
    }
    if (hasError) return;

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
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'manual' | 'photo')}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="photo">Scan Receipt</TabsTrigger>
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
                  </select>
                  {categoryError && <p className="text-sm text-red-500">{categoryError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    autoFocus
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {amountError && <p className="text-sm text-red-500">{amountError}</p>}
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
                {labelError && <p className="text-sm text-red-500">{labelError}</p>}
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
          </Tabs>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
