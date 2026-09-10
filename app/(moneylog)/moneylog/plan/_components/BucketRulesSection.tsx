// app/(moneylog)/moneylog/plan/_components/BucketRulesSection.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { bucketsQuery } from '@/lib/moneylog/queries';

type Rule = { id: string; mode: string; value: number; bucket: { name: string } | null };

export function BucketRulesSection({ recurringItemId, recurringItemType }: { recurringItemId: string; recurringItemType: string }) {
  const { data, mutate } = useSWR<{ rules: Rule[] }>(
    `/api/moneylog/recurring-items/${recurringItemId}/rules`,
    async (url: string) => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load rules');
      return res.json();
    }
  );
  const { data: bucketsData } = useSWR(bucketsQuery().key, bucketsQuery().fetcher);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [bucketId, setBucketId] = useState('');
  const [mode, setMode] = useState<'fixed_amount' | 'percentage'>('percentage');
  const [value, setValue] = useState('');

  if (recurringItemType !== 'income') return null;

  const buckets = bucketsData?.buckets ?? [];

  const submit = async () => {
    if (!bucketId || !value || Number(value) <= 0) {
      toast({ variant: 'destructive', title: 'Choose a bucket and enter a valid value' });
      return;
    }
    const res = await apiFetch(`/api/moneylog/buckets/${bucketId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurringItemId, mode, value: Number(value) }),
    });
    if (res.ok) {
      toast({ title: 'Rule added' });
      setAdding(false);
      setValue('');
      mutate();
    }
  };

  return (
    <div className="space-y-2 border-t pt-3 mt-3">
      <p className="text-sm font-medium">Auto-add to buckets</p>
      {(data?.rules ?? []).map((rule) => (
        <p key={rule.id} className="text-sm text-muted-foreground">
          {rule.mode === 'percentage' ? `${rule.value}%` : `$${rule.value.toFixed(2)}`} → {rule.bucket?.name ?? 'Unknown bucket'}
        </p>
      ))}
      {!adding && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-2 size-3" />
          Add rule
        </Button>
      )}
      {adding && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="rule-bucket">Bucket</Label>
            <Select value={bucketId} onValueChange={setBucketId}>
              <SelectTrigger id="rule-bucket">
                <SelectValue placeholder="Choose a bucket" />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === 'percentage' ? 'default' : 'outline'} size="sm" onClick={() => setMode('percentage')}>%</Button>
            <Button type="button" variant={mode === 'fixed_amount' ? 'default' : 'outline'} size="sm" onClick={() => setMode('fixed_amount')}>$</Button>
          </div>
          <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'percentage' ? '20' : '50.00'} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
