// app/(sociallog)/sociallog/search/_components/ReelViewer.tsx
'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export type Reel = {
  id: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  body: string | null;
  author: { username: string };
};

export function ReelViewer({ reels, startIndex, onClose }: { reels: Reel[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const reel = reels[index];

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(reels.length - 1, i + delta)));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta > 50) go(-1);
        else if (delta < -50) go(1);
        touchStartX.current = null;
      }}
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-white">
        <X className="size-6" />
      </button>
      {index > 0 && (
        <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-4 text-white">
          <ChevronLeft className="size-8" />
        </button>
      )}
      {index < reels.length - 1 && (
        <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-4 text-white">
          <ChevronRight className="size-8" />
        </button>
      )}
      {reel.mediaType === 'video' ? (
        <div className="max-h-[80vh] max-w-[90vw]">
          <video src={reel.mediaUrl ?? undefined} controls autoPlay className="max-h-[80vh] max-w-[90vw] rounded-lg" />
        </div>
      ) : (
        reel.mediaUrl && (
          <div className="relative h-[80vh] w-[90vw]">
            <Image src={reel.mediaUrl} alt="" fill sizes="90vw" priority className="rounded-lg object-contain" />
          </div>
        )
      )}
      <div className="mt-3 text-center text-white">
        <p className="text-sm font-semibold">@{reel.author.username}</p>
        {reel.body && <p className="text-xs text-white/80">{reel.body}</p>}
      </div>
    </div>
  );
}
