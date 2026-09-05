// components/watchlog/WatchDetailSheet.tsx
'use client';

import Image from 'next/image';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TmdbItem, WatchItemRow } from '@/lib/watchlog/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';

function isWatchItemRow(item: TmdbItem | WatchItemRow): item is WatchItemRow {
  return 'id' in item && 'status' in item;
}

interface WatchDetailSheetProps {
  item: (TmdbItem | WatchItemRow) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd?: () => void;
  onMarkWatched?: () => void;
  onIgnore?: () => void;
}

const STATUS_LABEL: Record<WatchItemRow['status'], string> = {
  want: 'In your Want to Watch list',
  watching: "You're currently watching this",
  completed: "You've completed this",
};

export function WatchDetailSheet({ item, open, onOpenChange, onAdd, onMarkWatched, onIgnore }: WatchDetailSheetProps) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) {
      setTrailerKey(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/watchlog/tmdb/videos?tmdbId=${item?.tmdbId}&mediaType=${item?.mediaType}`)
      .then((res) => (res.ok ? res.json() : { trailerKey: null }))
      .then((json) => {
        if (!cancelled) setTrailerKey(json.trailerKey ?? null);
      })
      .catch(() => {
        if (!cancelled) setTrailerKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.tmdbId, item?.mediaType]);

  if (!item) return null;
  const alreadyTracked = isWatchItemRow(item);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{item.title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">
          <div className="flex gap-4">
            <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
              {item.posterPath ? (
                <Image src={`${TMDB_IMG_BASE}${item.posterPath}`} alt={item.title} fill sizes="112px" className="object-cover" />
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{item.releaseYear ?? 'Unknown year'}</p>
              <div className="flex flex-wrap gap-1">
                {item.genres.map((genre) => (
                  <Badge key={genre} variant="secondary">
                    {genre}
                  </Badge>
                ))}
              </div>
              {!alreadyTracked && (
                <span className="flex items-center gap-1 text-sm">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {item.voteAverage.toFixed(1)}
                </span>
              )}
              {alreadyTracked && (
                <p className="text-sm text-muted-foreground">{STATUS_LABEL[item.status]}</p>
              )}
            </div>
          </div>

          {!alreadyTracked && item.overview && (
            <p className="mt-4 text-sm text-muted-foreground">{item.overview}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {!alreadyTracked && onAdd && (
              <Button onClick={onAdd}>Add to Watchlist</Button>
            )}
            {onMarkWatched && (!alreadyTracked || item.status !== 'completed') && (
              <Button variant="secondary" onClick={onMarkWatched}>
                Mark as Watched
              </Button>
            )}
            {onIgnore && (
              <Button variant="outline" onClick={onIgnore}>
                Not Interested
              </Button>
            )}
          </div>

          {trailerKey && (
            <div className="mt-6">
              <p className="text-sm font-medium mb-2">Trailer</p>
              <div className="aspect-video w-full overflow-hidden rounded-xl">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${trailerKey}`}
                  title="Trailer"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
