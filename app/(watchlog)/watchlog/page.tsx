// app/(watchlog)/watchlog/page.tsx
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { WatchLogBottomNav } from '@/components/WatchLogBottomNav';
import { DiscoverContent } from './_components/DiscoverContent';

function TabLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

/**
 * /watchlog is a single page for all four of its nav tabs (Home, Watchlist,
 * Discover, Stats), switched via `?tab=` — same pattern as LearnLog. Home,
 * Watchlist, and Stats land in later tasks; Discover renders for every tab
 * until then so the route is exercisable end-to-end as each piece lands.
 */
export default function WatchLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <WatchLogTabSwitcher />
    </Suspense>
  );
}

function WatchLogTabSwitcher() {
  useSearchParams();

  return (
    <>
      <DiscoverContent />
      <WatchLogBottomNav />
    </>
  );
}
