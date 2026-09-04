// app/(watchlog)/watchlog/_components/DiscoverContent.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { GooeyInput } from '@/components/ui/gooey-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { TitleCarousel } from '@/components/watchlog/TitleCarousel';
import { WatchDetailSheet } from '@/components/watchlog/WatchDetailSheet';
import type { TmdbItem } from '@/lib/watchlog/types';

async function fetchTrending(): Promise<TmdbItem[]> {
  const res = await fetch('/api/watchlog/tmdb/trending');
  const json = await res.json();
  return json.results ?? [];
}

async function fetchSearch(query: string): Promise<TmdbItem[]> {
  const res = await fetch(`/api/watchlog/tmdb/search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  return json.results ?? [];
}

export function DiscoverContent() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TmdbItem | null>(null);
  const { toast } = useToast();
  const { data: trending, isLoading: trendingLoading } = useSWR('watchlog-trending', fetchTrending);
  const { data: searchResults, isLoading: searchLoading } = useSWR(
    query.length > 1 ? ['watchlog-search', query] : null,
    () => fetchSearch(query)
  );

  const isSearching = query.length > 1;

  async function addItem(item: TmdbItem, status: 'want' | 'completed' = 'want') {
    const res = await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast({ title: 'Could not add', description: json.error ?? 'Unknown error', variant: 'destructive' });
      return;
    }
    toast({ description: status === 'completed' ? `Marked "${item.title}" as watched` : `Added "${item.title}" to your watchlist` });
    setSelected(null);
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Discover" />
      <div className="p-4 space-y-6">
        <div className="flex justify-center">
          <GooeyInput
            placeholder="Search movies & TV..."
            value={query}
            onValueChange={setQuery}
          />
        </div>

        {isSearching ? (
          searchLoading ? (
            <Skeleton className="h-[320px] w-full rounded-xl" />
          ) : (
            <TitleCarousel title="Search Results" items={searchResults ?? []} onSelect={setSelected} />
          )
        ) : trendingLoading ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : (
          <TitleCarousel title="Trending This Week" items={trending ?? []} onSelect={setSelected} />
        )}
      </div>

      <WatchDetailSheet
        item={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        onAdd={selected ? () => addItem(selected) : undefined}
        onMarkWatched={selected ? () => addItem(selected, 'completed') : undefined}
      />
    </div>
  );
}
