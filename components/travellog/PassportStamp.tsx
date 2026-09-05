// components/travellog/PassportStamp.tsx
//
// One visit rendered as a passport stamp. Position jitter and rotation are
// derived from the visit's own id rather than Math.random(), so a stamp sits
// in exactly the same spot on every render (a random offset would make the
// whole page reshuffle on any re-render, which reads as a glitch).

'use client';

import { Plane, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Stable 31-bit hash of a string — same id always yields the same number. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** 'YYYY-MM-DD' -> '14 MAR 2026', the terse all-caps form real stamps use. */
function stampDate(date: string): string {
  const [y, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1] ?? '';
  return `${Number(d)} ${month} ${y}`;
}

export function PassportStamp({
  visit,
  onClick,
}: {
  visit: TravelVisitRow;
  onClick: () => void;
}) {
  const hash = hashId(visit.id);
  // -8..8 degrees of tilt, and a few px of drift inside the stamp's grid
  // cell — enough to look hand-pressed without letting stamps collide.
  const rotation = (hash % 17) - 8;
  const offsetX = ((hash >> 3) % 13) - 6;
  const offsetY = ((hash >> 7) % 13) - 6;

  const isRoadTrip = visit.travelMode === 'road_trip';
  const explored = isExplored(visit);
  const Icon = isRoadTrip ? Car : Plane;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${visit.placeName}, ${stampDate(visit.arrivalDate)}`}
      style={{ transform: `rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px)` }}
      className={cn(
        'group flex aspect-square w-full flex-col items-center justify-center gap-0.5 border-2 p-2 text-center',
        'border-primary/60 text-primary transition-transform hover:scale-105 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        isRoadTrip ? 'rounded-xl' : 'rounded-full',
        // A multi-day stay gets a second ring — the passport equivalent of a
        // longer stop mattering more than a touch-and-go.
        explored && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-transparent'
      )}
    >
      <Icon className="size-3 shrink-0 opacity-70" aria-hidden />
      <span className="line-clamp-2 text-[10px] leading-tight font-semibold uppercase tracking-wide">
        {visit.placeName}
      </span>
      <span className="text-[8px] leading-none opacity-70 tabular-nums">
        {stampDate(visit.arrivalDate)}
      </span>
    </button>
  );
}
