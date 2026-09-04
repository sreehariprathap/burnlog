// app/(watchlog)/watchlog/_components/WatchlistContent.tsx
'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { TopBar } from '@/components/TopBar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { watchItemsQuery } from '@/lib/watchlog/queries';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import type { WatchStatus } from '@/lib/watchlog/types';

const STATUS_TABS: { value: WatchStatus; label: string }[] = [
  { value: 'want', label: 'Want to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
];

export function WatchlistContent() {
  const { profile } = useCurrentProfile();
  const [status, setStatus] = useState<WatchStatus>('want');
  const query = profile ? watchItemsQuery(profile.id, status) : null;
  const { data, isLoading } = useSWR(query?.key ?? null, query?.fetcher ?? null);

  async function advanceStatus(id: string, next: WatchStatus) {
    await fetch(`/api/watchlog/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (profile) {
      mutate(watchItemsQuery(profile.id, status).key);
      mutate(watchItemsQuery(profile.id, next).key);
    }
  }

  const nextStatus: Partial<Record<WatchStatus, WatchStatus>> = { want: 'watching', watching: 'completed' };

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Watchlist" />
      <div className="p-4 space-y-4">
        <Tabs value={status} onValueChange={(v) => setStatus(v as WatchStatus)}>
          <TabsList className="w-full">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nothing here yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(data ?? []).map((item) => {
              const next = nextStatus[item.status];
              return (
                <WatchItemCard
                  key={item.id}
                  item={item}
                  badge={next ? `Mark ${next === 'watching' ? 'Watching' : 'Completed'}` : undefined}
                  onClick={next ? () => advanceStatus(item.id, next) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
