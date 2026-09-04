// app/(watchlog)/watchlog/page.tsx
'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { WatchLogBottomNav } from '@/components/WatchLogBottomNav';
import { DiscoverContent } from './_components/DiscoverContent';

const HomeContent = dynamic(() => import('./_components/HomeContent').then((m) => m.HomeContent), {
  loading: () => <TabLoading />,
});
const WatchlistContent = dynamic(() => import('./_components/WatchlistContent').then((m) => m.WatchlistContent), {
  loading: () => <TabLoading />,
});
const StatsContent = dynamic(() => import('./_components/StatsContent').then((m) => m.StatsContent), {
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

/**
 * /watchlog is a single page for all four of its nav tabs (Home, Watchlist,
 * Discover, Stats), switched via `?tab=` — same pattern as LearnLog.
 */
export default function WatchLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <WatchLogTabSwitcher />
    </Suspense>
  );
}

function WatchLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'watchlist' ? (
        <WatchlistContent />
      ) : tab === 'discover' ? (
        <DiscoverContent />
      ) : tab === 'stats' ? (
        <StatsContent />
      ) : (
        <HomeContent />
      )}
      <WatchLogBottomNav />
    </>
  );
}
