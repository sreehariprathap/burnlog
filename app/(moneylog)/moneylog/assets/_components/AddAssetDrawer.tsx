// app/(moneylog)/moneylog/assets/_components/AddAssetDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ASSET_CATEGORIES } from '@/lib/moneylog/assetCategories';
import { SIP_FREQUENCIES } from '@/lib/moneylog/sipFrequency';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddAssetDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddAssetDrawer({ open, onOpenChange, onCreated }: AddAssetDrawerProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('bank');
  const [initialValue, setInitialValue] = useState('');
  const [investedValue, setInvestedValue] = useState('');
  const [expectedGrowthRate, setExpectedGrowthRate] = useState('');
  const [sipEnabled, setSipEnabled] = useState(false);
  const [sipAmount, setSipAmount] = useState('');
  const [sipFrequency, setSipFrequency] = useState<string>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [initialValueError, setInitialValueError] = useState<string | null>(null);
  const [sipAmountError, setSipAmountError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setCategory('bank');
    setInitialValue('');
    setInvestedValue('');
    setExpectedGrowthRate('');
    setSipEnabled(false);
    setSipAmount('');
    setSipFrequency('monthly');
    setNameError(null);
    setInitialValueError(null);
    setSipAmountError(null);
  };

  const submit = async () => {
    setNameError(null);
    setInitialValueError(null);
    setSipAmountError(null);

    const value = Number(initialValue);
    let hasError = false;
    if (!name.trim()) {
      setNameError('Enter a name');
      hasError = true;
    }
    if (!Number.isFinite(value) || value < 0) {
      setInitialValueError('Enter a valid starting balance');
      hasError = true;
    }
    if (sipEnabled && (!sipAmount || !Number.isFinite(Number(sipAmount)) || Number(sipAmount) <= 0)) {
      setSipAmountError('Enter a valid SIP amount');
      hasError = true;
    }
    if (hasError) {
      toast({ variant: 'destructive', title: 'Fix the highlighted fields' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/api/moneylog/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        initialValue: value,
        investedValue: investedValue ? Number(investedValue) : undefined,
        expectedGrowthRate: expectedGrowthRate ? Number(expectedGrowthRate) : undefined,
        sipEnabled,
        sipAmount: sipEnabled ? Number(sipAmount) : undefined,
        sipFrequency: sipEnabled ? sipFrequency : undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Asset added' });
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Asset</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Savings" />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="asset-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-initial-value">Starting balance</Label>
            <Input
              id="asset-initial-value"
              type="number"
              min="0"
              step="0.01"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              placeholder="0.00"
            />
            {initialValueError && <p className="text-sm text-destructive">{initialValueError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-invested-value">Invested amount (optional)</Label>
            <Input
              id="asset-invested-value"
              type="number"
              min="0"
              step="0.01"
              value={investedValue}
              onChange={(e) => setInvestedValue(e.target.value)}
              placeholder={initialValue || '0.00'}
            />
            <p className="text-xs text-muted-foreground">Defaults to the starting balance — set this if you&apos;ve already grown past what you put in.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-growth-rate">Expected annual growth rate % (optional)</Label>
            <Input
              id="asset-growth-rate"
              type="number"
              step="0.1"
              value={expectedGrowthRate}
              onChange={(e) => setExpectedGrowthRate(e.target.value)}
              placeholder="8"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="asset-sip-enabled">SIP enrolled</Label>
              <p className="text-xs text-muted-foreground">Recurring contribution to this asset</p>
            </div>
            <Switch id="asset-sip-enabled" checked={sipEnabled} onCheckedChange={setSipEnabled} />
          </div>
          {sipEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-sip-amount">SIP amount</Label>
                <Input
                  id="asset-sip-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={sipAmount}
                  onChange={(e) => setSipAmount(e.target.value)}
                  placeholder="0.00"
                />
                {sipAmountError && <p className="text-sm text-destructive">{sipAmountError}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-sip-frequency">Frequency</Label>
                <Select value={sipFrequency} onValueChange={setSipFrequency}>
                  <SelectTrigger id="asset-sip-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIP_FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add Asset'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
