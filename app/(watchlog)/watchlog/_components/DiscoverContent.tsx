// app/(watchlog)/watchlog/_components/DiscoverContent.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
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
  const { toast } = useToast();
  const { data: trending, isLoading: trendingLoading } = useSWR('watchlog-trending', fetchTrending);
  const { data: searchResults, isLoading: searchLoading } = useSWR(
    query.length > 1 ? ['watchlog-search', query] : null,
    () => fetchSearch(query)
  );

  const results = query.length > 1 ? searchResults : trending;
  const loading = query.length > 1 ? searchLoading : trendingLoading;

  async function handleAdd(item: TmdbItem) {
    const res = await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast({ title: 'Could not add', description: json.error ?? 'Unknown error', variant: 'destructive' });
      return;
    }
    toast({ description: `Added "${item.title}" to your watchlist` });
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Discover" />
      <div className="p-4 space-y-4">
        <Input
          placeholder="Search movies & TV..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(results ?? []).map((item) => (
              <WatchItemCard key={`${item.mediaType}-${item.tmdbId}`} item={item} onClick={() => handleAdd(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
