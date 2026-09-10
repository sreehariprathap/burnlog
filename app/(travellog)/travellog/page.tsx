'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { HomeContent } from './_components/HomeContent';

const TripsContent = dynamic(() => import('./trips/_components/TripsContent').then((m) => m.TripsContent), {
  loading: () => <TabLoading />,
});
const PlanContent = dynamic(() => import('./plan/_components/PlanContent').then((m) => m.PlanContent), {
  loading: () => <TabLoading />,
});
const SuggestionsContent = dynamic(
  () => import('./suggestions/_components/SuggestionsContent').then((m) => m.SuggestionsContent),
  { loading: () => <TabLoading /> }
);

function TabLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

/**
 * /travellog is a single page for all four of its nav tabs (Home, Trips,
 * Plan, Suggest) — see TravelLogBottomNav, which switches between them via
 * `?tab=` instead of navigating. The old Map tab (world-map visualization)
 * is hidden — its route/components still exist, just unreachable from the
 * switcher, so `?tab=map` falls through to Home below. /travellog/trips/[id]
 * (a trip's own detail page) stays a real, separate route — only the list
 * view merged in.
 */
export default function TravelLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <TravelLogTabSwitcher />
    </Suspense>
  );
}

function TravelLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'trips' ? (
        <TripsContent />
      ) : tab === 'plan' ? (
        <PlanContent />
      ) : tab === 'suggestions' ? (
        <SuggestionsContent />
      ) : (
        <HomeContent />
      )}
      <TravelLogBottomNav />
    </>
  );
}
