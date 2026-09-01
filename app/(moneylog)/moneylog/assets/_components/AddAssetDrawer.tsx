// app/(moneylog)/moneylog/assets/_components/AddAssetDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSET_CATEGORIES } from '@/lib/moneylog/assetCategories';
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
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setCategory('bank');
    setInitialValue('');
  };

  const submit = async () => {
    const value = Number(initialValue);
    if (!name.trim() || !Number.isFinite(value) || value < 0) {
      toast({ variant: 'destructive', title: 'Enter a name and a valid starting balance' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/api/moneylog/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, initialValue: value }),
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
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add Asset'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
