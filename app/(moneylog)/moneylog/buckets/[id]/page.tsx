// app/(moneylog)/moneylog/buckets/[id]/page.tsx
'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { AddEntryDrawer } from './_components/AddEntryDrawer';
import { EntryListItem } from './_components/EntryListItem';

type BucketDetail = {
  bucket: { id: string; name: string; targetAmount: number | null; balance: number; progress: number | null };
  entries: { id: string; type: string; amount: number; note: string | null; source: string; createdAt: string }[];
};

export default function BucketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, mutate } = useSWR<BucketDetail>(`/api/moneylog/buckets/${id}`, async (url: string) => {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Failed to load bucket');
    return res.json();
  });
  const [entryOpen, setEntryOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={data?.bucket.name ?? 'Bucket'} />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {data && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-2">
                <p className="text-2xl font-semibold">${data.bucket.balance.toFixed(2)}</p>
                {data.bucket.targetAmount !== null && (
                  <>
                    <Progress value={(data.bucket.progress ?? 0) * 100} />
                    <p className="text-xs text-muted-foreground">
                      {Math.round((data.bucket.progress ?? 0) * 100)}% of ${data.bucket.targetAmount.toFixed(2)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Button variant="outline" className="w-full" onClick={() => setEntryOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add or Withdraw
            </Button>
            <div className="space-y-1">
              {data.entries
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((entry) => (
                  <EntryListItem key={entry.id} entry={entry} />
                ))}
            </div>
          </>
        )}
      </main>
      <AddEntryDrawer bucketId={id} open={entryOpen} onOpenChange={setEntryOpen} onSaved={() => mutate()} />
    </div>
  );
}
