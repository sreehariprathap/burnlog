// app/(moneylog)/moneylog/buckets/[id]/_components/AddEntryDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddEntryDrawerProps {
  bucketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddEntryDrawer({ bucketId, open, onOpenChange, onSaved }: AddEntryDrawerProps) {
  const { toast } = useToast();
  const [type, setType] = useState<'contribution' | 'withdrawal'>('contribution');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const reset = () => {
    setAmount('');
    setNote('');
    setAmountError(null);
  };

  const submit = async () => {
    setAmountError(null);
    const amountNum = Number(amount);
    if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) {
      setAmountError('Enter a valid amount');
      toast({ variant: 'destructive', title: 'Fix the highlighted fields' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(`/api/moneylog/buckets/${bucketId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount: amountNum, note: note || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: type === 'contribution' ? 'Added to bucket' : 'Withdrawn from bucket' });
      reset();
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add or Withdraw</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={type === 'contribution' ? 'default' : 'outline'} onClick={() => setType('contribution')}>
              Add money
            </Button>
            <Button type="button" variant={type === 'withdrawal' ? 'default' : 'outline'} onClick={() => setType('withdrawal')}>
              Withdraw
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-amount">Amount</Label>
            <Input id="entry-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {amountError && <p className="text-sm text-destructive">{amountError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-note">Note (optional)</Label>
            <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flight booking" />
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
