// app/(tasklog)/tasklog/page.tsx
// Client Component — metadata is exported from a server layout/page elsewhere; not applicable here.
'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';
import { HomeContent } from './_components/HomeContent';

const BoardContent = dynamic(() => import('./board/_components/BoardContent').then((m) => m.BoardContent), {
  loading: () => <TabLoading />,
});
const PlanContent = dynamic(() => import('./plan/_components/PlanContent').then((m) => m.PlanContent), {
  loading: () => <TabLoading />,
});
const GoalsContent = dynamic(() => import('./goals/_components/GoalsContent').then((m) => m.GoalsContent), {
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
 * /tasklog is a single page for all four of its nav tabs (Home, Board,
 * Plan, Goals) — see TaskLogBottomNav, which switches between them via
 * `?tab=` instead of navigating. Board in particular (dnd-kit + its own
 * component tree) stays dynamically imported so that code only loads once
 * someone actually switches to it.
 */
export default function TaskLogDashboardPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <TaskLogTabSwitcher />
    </Suspense>
  );
}

function TaskLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'board' ? (
        <BoardContent />
      ) : tab === 'plan' ? (
        <PlanContent />
      ) : tab === 'goals' ? (
        <GoalsContent />
      ) : (
        <HomeContent />
      )}
      <TaskLogBottomNav />
    </>
  );
}
