// components/logbook/MorningBrief.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sunrise, ChevronRight } from 'lucide-react';
import { dismissMorningBriefToday, isBeforeNoon, isMorningBriefDismissedToday } from '@/lib/logbook/morningDismiss';

export function MorningBrief() {
  const [dismissed, setDismissed] = useState(true);
  const [beforeNoon, setBeforeNoon] = useState(false);

  useEffect(() => {
    setBeforeNoon(isBeforeNoon());
    setDismissed(isMorningBriefDismissedToday());
  }, []);

  function handleDismiss() {
    dismissMorningBriefToday();
    setDismissed(true);
  }

  if (dismissed || !beforeNoon) {
    return null;
  }

  return (
    <Link
      href="/logbook/morning"
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 transition-colors hover:from-primary/20"
    >
      <Sunrise className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1">
        <p className="text-sm font-semibold">Your morning brief is ready</p>
        <p className="text-xs text-muted-foreground">Yesterday&apos;s score, today&apos;s targets, and an insight</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDismiss();
        }}
        aria-label="Dismiss morning brief"
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Link>
  );
}
