// components/watchlog/WatchItemCard.tsx
'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import type { TmdbItem, WatchItemRow } from '@/lib/watchlog/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';

interface WatchItemCardProps {
  item: TmdbItem | WatchItemRow;
  onClick?: () => void;
  badge?: string;
}

export function WatchItemCard({ item, onClick, badge }: WatchItemCardProps) {
  return (
    <Card onClick={onClick} className="overflow-hidden cursor-pointer">
      <div className="relative aspect-[2/3] bg-muted">
        {item.posterPath ? (
          <Image src={`${TMDB_IMG_BASE}${item.posterPath}`} alt={item.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No poster</div>
        )}
        {badge && (
          <span className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
            {badge}
          </span>
        )}
      </div>
      <CardContent className="p-2">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">{item.releaseYear ?? ''}</p>
      </CardContent>
    </Card>
  );
}
