// components/watchlog/TitleCarousel.tsx
// Adapted from kokonutui's Carousel Cards (https://kokonutui.com/docs/cards/carousel-cards)
// for movie/TV data instead of the original Airbnb-experience demo content.
'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import type { TmdbItem } from '@/lib/watchlog/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';

function TitleCard({ item, onClick }: { item: TmdbItem; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      <Card className="group relative flex h-[320px] w-full flex-col overflow-hidden rounded-xl border-0 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl bg-muted">
          {item.posterPath ? (
            <Image
              alt={item.title}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              fill
              src={`${TMDB_IMG_BASE}${item.posterPath}`}
            />
          ) : null}
          {item.mediaType && (
            <Badge className="absolute top-2 left-2 rounded-md bg-white/90 px-1.5 py-0.5 font-medium text-black text-xs">
              {item.mediaType === 'tv' ? 'TV' : 'Movie'}
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <CardContent className="p-2 pt-3 pb-0">
            <h3 className="line-clamp-2 font-medium text-sm tracking-tight">{item.title}</h3>
            <p className="text-muted-foreground text-xs tracking-tight">{item.releaseYear ?? ''}</p>
          </CardContent>
          <CardFooter className="mt-auto flex items-center gap-0.5 p-2 pt-0 text-xs">
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-current" />
              {item.voteAverage.toFixed(1)}
            </span>
          </CardFooter>
        </div>
      </Card>
    </button>
  );
}

interface TitleCarouselProps {
  title: string;
  items: TmdbItem[];
  onSelect: (item: TmdbItem) => void;
}

export function TitleCarousel({ title, items, onSelect }: TitleCarouselProps) {
  const scrollContainer = useRef<HTMLDivElement>(null);

  function scrollBy(delta: number) {
    scrollContainer.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-base tracking-tight">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            className="h-7 w-7 rounded-full"
            onClick={() => scrollBy(-320)}
            size="icon"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Scroll left</span>
          </Button>
          <Button
            className="h-7 w-7 rounded-full"
            onClick={() => scrollBy(320)}
            size="icon"
            variant="outline"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Scroll right</span>
          </Button>
        </div>
      </div>
      <div
        className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        ref={scrollContainer}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <div className="w-[160px] flex-none snap-start" key={`${item.mediaType}-${item.tmdbId}`}>
            <TitleCard item={item} onClick={() => onSelect(item)} />
          </div>
        ))}
      </div>
    </div>
  );
}
