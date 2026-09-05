// app/(watchlog)/watchlog/_components/DiscoverContent.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { GooeyInput } from '@/components/ui/gooey-input';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { TitleCarousel } from '@/components/watchlog/TitleCarousel';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import { WatchDetailSheet } from '@/components/watchlog/WatchDetailSheet';
import { BROWSE_GENRE_ROWS, REGIONAL_ROWS } from '@/lib/watchlog/discoverRows';
import type { TmdbItem } from '@/lib/watchlog/types';

async function fetchTrending(): Promise<TmdbItem[]> {
  const res = await fetch('/api/watchlog/tmdb/trending');
  const json = await res.json();
  return json.results ?? [];
}

async function fetchBrowseRow(movieGenreId?: number, tvGenreId?: number, originalLanguage?: string): Promise<TmdbItem[]> {
  const params = new URLSearchParams();
  if (movieGenreId) params.set('movieGenreId', String(movieGenreId));
  if (tvGenreId) params.set('tvGenreId', String(tvGenreId));
  if (originalLanguage) params.set('originalLanguage', originalLanguage);
  const res = await fetch(`/api/watchlog/tmdb/discover?${params.toString()}`);
  const json = await res.json();
  return json.results ?? [];
}

async function fetchSearch(query: string): Promise<TmdbItem[]> {
  const res = await fetch(`/api/watchlog/tmdb/search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  return json.results ?? [];
}

function BrowseRow({ label, movieGenreId, tvGenreId, originalLanguage, onSelect }: {
  label: string;
  movieGenreId?: number;
  tvGenreId?: number;
  originalLanguage?: string;
  onSelect: (item: TmdbItem) => void;
}) {
  const { data, isLoading } = useSWR(
    ['watchlog-browse', label],
    () => fetchBrowseRow(movieGenreId, tvGenreId, originalLanguage)
  );
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;
  return <TitleCarousel title={label} items={data ?? []} onSelect={onSelect} />;
}

export function DiscoverContent() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TmdbItem | null>(null);
  const { toast } = useToast();

  const { data: trending, isLoading: trendingLoading } = useSWR('watchlog-trending', fetchTrending);
  const { data: searchResults, isLoading: searchLoading } = useSWR(
    query.length > 1 ? ['watchlog-search', query] : null,
    () => fetchSearch(query)
  );

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
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSearchOpen(true);
            }}
            className="w-full max-w-sm"
          >
            <GooeyInput placeholder="Search movies & TV..." className="pointer-events-none w-full" />
          </div>
        </div>

        {trendingLoading ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : (
          <TitleCarousel title="Trending This Week" items={trending ?? []} onSelect={setSelected} />
        )}

        {BROWSE_GENRE_ROWS.map((row) => (
          <BrowseRow key={row.label} label={row.label} movieGenreId={row.movieGenreId} tvGenreId={row.tvGenreId} onSelect={setSelected} />
        ))}

        {REGIONAL_ROWS.map((row) => (
          <BrowseRow key={row.label} label={row.label} originalLanguage={row.originalLanguage} onSelect={setSelected} />
        ))}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 p-4">
            <Input
              autoFocus
              placeholder="Search movies & TV..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {query.length <= 1 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Start typing to search.</p>
            ) : searchLoading ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(searchResults ?? []).map((item) => (
                  <WatchItemCard
                    key={`${item.mediaType}-${item.tmdbId}`}
                    item={item}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
