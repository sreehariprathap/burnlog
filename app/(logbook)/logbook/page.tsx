'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppTour } from '@/components/AppTour';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { LogbookHomeContent } from './_components/LogbookHomeContent';

const MyDayClient = dynamic(
  () => import('./myday/_components/MyDayClient').then((mod) => mod.MyDayClient),
  {
    loading: () => (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    ),
  }
);

// Client Component — page metadata (title) is set via the root layout's
// default; add a Metadata export here if this is ever converted to a
// Server Component wrapper.

/**
 * /logbook is a single page for both of its nav tabs (Home, MyDay) — see
 * LogbookBottomNav, which switches between them via `?tab=` instead of
 * navigating. MyDayClient stays dynamically imported so its code (and the
 * myday-specific components it pulls in) only loads once someone actually
 * switches to that tab, not on every /logbook visit.
 */
export default function LogbookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <LogbookTabSwitcher />
    </Suspense>
  );
}

function LogbookTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      <AppTour />
      {tab === 'myday' ? <MyDayClient /> : <LogbookHomeContent />}
      <LogbookBottomNav />
    </>
  );
}
