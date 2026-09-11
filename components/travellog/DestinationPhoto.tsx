'use client';

import useSWR from 'swr';
import { MapPin } from 'lucide-react';
import { glowGradient } from '@/lib/theme/glowPalette';
import { cn } from '@/lib/utils';
import type { DestinationPhoto as DestinationPhotoData } from '@/app/api/travellog/photo/route';

async function fetchPhoto(url: string): Promise<DestinationPhotoData | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.photo ?? null;
}

/**
 * Destination header image, backed by Unsplash (app/api/travellog/photo).
 * Falls back to the same colored gradient + pin used before photos existed
 * whenever Unsplash isn't configured, has no match, or is still loading —
 * so every card looks intentional either way, not broken.
 */
export function DestinationPhoto({
  destination,
  gradientIndex = 0,
  className,
  children,
}: {
  destination: string;
  /** Picks which color from the shared gradient palette to fall back to. */
  gradientIndex?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const { data: photo } = useSWR(
    destination ? `/api/travellog/photo?q=${encodeURIComponent(destination)}` : null,
    fetchPhoto,
    { dedupingInterval: 60 * 60 * 1000, revalidateOnFocus: false, revalidateIfStale: false }
  );

  return (
    <div className={cn('relative flex items-center overflow-hidden', className)}>
      {photo ? (
        <img
          src={photo.url}
          alt={photo.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: glowGradient(gradientIndex) }} />
      )}
      {children && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="relative z-10 flex w-full items-center gap-2 px-4 text-white">
            <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
            {children}
          </div>
        </>
      )}
      {photo && (
        // A real <a> here would be invalid HTML wherever this sits inside
        // another interactive element (WeeklyTripStack's <button>,
        // TripsContent's next/link <a>) — a styled span with a manual
        // window.open avoids that nesting while still linking out.
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            window.open(photo.photographerUrl, '_blank', 'noopener,noreferrer');
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.stopPropagation();
            e.preventDefault();
            window.open(photo.photographerUrl, '_blank', 'noopener,noreferrer');
          }}
          className="absolute bottom-1 right-2 z-10 text-[9px] text-white/70 hover:text-white"
        >
          Photo: {photo.photographerName}
        </span>
      )}
    </div>
  );
}
