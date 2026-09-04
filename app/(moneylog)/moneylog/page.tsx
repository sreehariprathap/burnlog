'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { HomeContent } from './_components/HomeContent';

const PlanContent = dynamic(() => import('./plan/_components/PlanContent').then((m) => m.PlanContent), {
  loading: () => <TabLoading />,
});
const GoalsContent = dynamic(() => import('./goals/_components/GoalsContent').then((m) => m.GoalsContent), {
  loading: () => <TabLoading />,
});
const InsightsContent = dynamic(() => import('./insights/_components/InsightsContent').then((m) => m.InsightsContent), {
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

// Client Component — cannot export `metadata`; each tab sets its own title via TopBar.

/**
 * /moneylog is a single page for all four of its nav tabs (Home, Plan,
 * Goals, Insights) — see MoneyLogBottomNav, which switches between them via
 * `?tab=` instead of navigating. Every non-Home tab stays dynamically
 * imported so its code only loads once someone actually switches to it.
 */
export default function MoneyLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <MoneyLogTabSwitcher />
    </Suspense>
  );
}

function MoneyLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'plan' ? (
        <PlanContent />
      ) : tab === 'goals' ? (
        <GoalsContent />
      ) : tab === 'insights' ? (
        <InsightsContent />
      ) : (
        <HomeContent />
      )}
      <MoneyLogBottomNav />
    </>
  );
}
