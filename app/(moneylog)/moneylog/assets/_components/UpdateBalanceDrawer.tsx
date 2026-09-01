// app/(moneylog)/moneylog/assets/_components/UpdateBalanceDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import type { AssetSummary } from './AssetListItem';

interface UpdateBalanceDrawerProps {
  asset: AssetSummary | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function UpdateBalanceDrawer({ asset, onOpenChange, onUpdated }: UpdateBalanceDrawerProps) {
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!asset) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast({ variant: 'destructive', title: 'Enter a valid balance' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(`/api/moneylog/assets/${asset.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: numeric, notes: notes || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Balance updated' });
      setValue('');
      setNotes('');
      onOpenChange(false);
      onUpdated();
    }
  };

  return (
    <Drawer open={!!asset} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Update {asset?.name}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-balance">New balance</Label>
            <Input
              id="new-balance"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance-notes">Notes (optional)</Label>
            <Input id="balance-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
