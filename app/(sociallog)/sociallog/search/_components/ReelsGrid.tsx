// app/(sociallog)/sociallog/search/_components/ReelsGrid.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Play } from 'lucide-react';
import { ReelViewer, type Reel } from './ReelViewer';
import { apiFetch } from '@/lib/sociallog/apiFetch';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load reels');
  return res.json();
}

export function ReelsGrid() {
  const { data, isLoading } = useSWR<{ reels: Reel[] }>('/api/sociallog/search/reels', fetcher);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  const reels = data?.reels ?? [];
  if (reels.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No reels yet — post a photo or video from the Dashboard.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {reels.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="relative aspect-square overflow-hidden bg-muted"
          >
            {r.mediaType === 'video' ? (
              <>
                {/* Browsers can't render a raw video URL as an <img> — prefer the
                    stored thumbnail, and fall back to a play-icon-only tile
                    (no broken image) until a thumbnail exists. */}
                {r.mediaThumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.mediaThumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
                <Play className="absolute right-1 top-1 size-4 text-white drop-shadow" fill="white" />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.mediaThumbnailUrl ?? r.mediaUrl ?? undefined} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <ReelViewer reels={reels} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
