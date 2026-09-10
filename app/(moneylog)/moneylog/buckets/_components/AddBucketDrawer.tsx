// app/(moneylog)/moneylog/buckets/_components/AddBucketDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddBucketDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddBucketDrawer({ open, onOpenChange, onCreated }: AddBucketDrawerProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setTargetAmount('');
    setTargetDate('');
    setNameError(null);
  };

  const submit = async () => {
    setNameError(null);
    if (!name.trim()) {
      setNameError('Enter a name');
      toast({ variant: 'destructive', title: 'Fix the highlighted fields' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/api/moneylog/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        targetAmount: targetAmount ? Number(targetAmount) : undefined,
        targetDate: targetDate || undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Bucket added' });
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Bucket</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-name">Name</Label>
            <Input id="bucket-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Travel Fund" />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-target-amount">Target amount (optional)</Label>
            <Input
              id="bucket-target-amount"
              type="number"
              min="0"
              step="0.01"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="2000.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bucket-target-date">Target date (optional)</Label>
            <Input id="bucket-target-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add Bucket'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
