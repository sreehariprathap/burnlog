// app/(watchlog)/watchlog/_components/SuggestionResults.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CardStack } from '@/components/ui/card-stack';
import { LayoutGrid } from '@/components/ui/layout-grid';
import { WatchDetailSheet } from '@/components/watchlog/WatchDetailSheet';
import type { TmdbItem } from '@/lib/watchlog/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';

// A repeating mosaic pattern for LayoutGrid's 3-column grid — every third
// card spans 2 columns/rows for visual variety, matching the shape of
// Aceternity's own layout-grid demo.
const GRID_PATTERNS = [
  'md:col-span-2 md:row-span-2 h-80 md:h-full',
  'col-span-1 h-80 md:h-full',
  'col-span-1 h-80 md:h-full',
];

interface SuggestionResultsProps {
  items: TmdbItem[];
  onAdd: (item: TmdbItem) => void;
  onMarkWatched: (item: TmdbItem) => void;
  onIgnore: (item: TmdbItem) => void;
}

function SuggestionActions({
  item,
  onAdd,
  onMarkWatched,
  onIgnore,
}: {
  item: TmdbItem;
  onAdd: () => void;
  onMarkWatched: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={onAdd}>
        Add
      </Button>
      <Button size="sm" variant="secondary" onClick={onMarkWatched}>
        Watched
      </Button>
      <Button size="sm" variant="outline" onClick={onIgnore}>
        Ignore
      </Button>
    </div>
  );
}

export function SuggestionResults({ items, onAdd, onMarkWatched, onIgnore }: SuggestionResultsProps) {
  const [view, setView] = useState<'stack' | 'grid'>('stack');
  const [detail, setDetail] = useState<TmdbItem | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing left to suggest — try a different mood.</p>;
  }

  // Each card carries its own actions in `content` (rather than a single
  // outer action row) because CardStack auto-cycles the top card on its
  // own internal timer — it doesn't expose which item is currently on top,
  // so actions must live inside each card to always match what's showing.
  const stackItems = items.map((item, index) => ({
    id: index,
    name: item.title,
    designation: [item.releaseYear, item.genres[0]].filter(Boolean).join(' · '),
    content: (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setDetail(item)} className="relative h-24 w-full overflow-hidden rounded-xl bg-muted text-left">
          {item.posterPath ? (
            <Image src={`${TMDB_IMG_BASE}${item.posterPath}`} alt={item.title} fill className="object-cover" />
          ) : null}
        </button>
        <span className="flex items-center gap-1 text-xs">
          <Star className="h-3 w-3 fill-current" />
          {item.voteAverage.toFixed(1)}
        </span>
        <SuggestionActions
          item={item}
          onAdd={() => onAdd(item)}
          onMarkWatched={() => onMarkWatched(item)}
          onIgnore={() => onIgnore(item)}
        />
      </div>
    ),
  }));

  const gridCards = items.map((item, index) => ({
    id: index,
    thumbnail: item.posterPath ? `${TMDB_IMG_BASE}${item.posterPath}` : '',
    className: GRID_PATTERNS[index % GRID_PATTERNS.length],
    content: (
      <div className="space-y-2 text-white">
        <p className="font-bold text-xl">{item.title}</p>
        <p className="text-sm text-white/80">{[item.releaseYear, item.genres[0]].filter(Boolean).join(' · ')}</p>
        <SuggestionActions
          item={item}
          onAdd={() => onAdd(item)}
          onMarkWatched={() => onMarkWatched(item)}
          onIgnore={() => onIgnore(item)}
        />
      </div>
    ),
  }));

  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={(v) => setView(v as 'stack' | 'grid')}>
        <TabsList>
          <TabsTrigger value="stack">Stack</TabsTrigger>
          <TabsTrigger value="grid">Grid</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'stack' ? (
        <div className="flex justify-center">
          <CardStack items={stackItems} />
        </div>
      ) : (
        <div className="h-[600px] w-full">
          <LayoutGrid cards={gridCards} />
        </div>
      )}

      <WatchDetailSheet
        item={detail}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        onAdd={detail ? () => { onAdd(detail); setDetail(null); } : undefined}
        onMarkWatched={detail ? () => { onMarkWatched(detail); setDetail(null); } : undefined}
        onIgnore={detail ? () => { onIgnore(detail); setDetail(null); } : undefined}
      />
    </div>
  );
}
