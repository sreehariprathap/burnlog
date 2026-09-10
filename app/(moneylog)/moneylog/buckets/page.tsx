// app/(moneylog)/moneylog/buckets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { bucketsQuery } from '@/lib/moneylog/queries';
import { BucketListItem } from './_components/BucketListItem';
import { AddBucketDrawer } from './_components/AddBucketDrawer';

export default function BucketsPage() {
  const { data, isLoading, mutate } = useSWR(bucketsQuery().key, bucketsQuery().fetcher);
  const [addOpen, setAddOpen] = useState(false);

  const buckets = data?.buckets ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Savings Buckets" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (
          <>
            <div className="space-y-2">
              {buckets.map((bucket) => (
                <BucketListItem key={bucket.id} bucket={bucket} />
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Bucket
            </Button>
          </>
        )}
      </main>
      <AddBucketDrawer open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()} />
      <MoneyLogBottomNav />
    </div>
  );
}
