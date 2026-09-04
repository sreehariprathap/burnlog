'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { HomeContent } from './_components/HomeContent';

const LibraryContent = dynamic(() => import('./library/_components/LibraryContent').then((m) => m.LibraryContent), {
  loading: () => <TabLoading />,
});
const SkillsContent = dynamic(() => import('./skills/_components/SkillsContent').then((m) => m.SkillsContent), {
  loading: () => <TabLoading />,
});
const CareerContent = dynamic(() => import('./career/_components/CareerContent').then((m) => m.CareerContent), {
  loading: () => <TabLoading />,
});
const ReflectionsContent = dynamic(
  () => import('./reflections/_components/ReflectionsContent').then((m) => m.ReflectionsContent),
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
 * /learnlog is a single page for all five of its nav tabs (Home, Library,
 * Skills, Career, Reflect) — see LearnLogBottomNav, which switches between
 * them via `?tab=` instead of navigating. /learnlog/skills/[id] (a skill's
 * own detail page) stays a real, separate route — only the list view
 * merged in.
 */
export default function LearnLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <LearnLogTabSwitcher />
    </Suspense>
  );
}

function LearnLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'library' ? (
        <LibraryContent />
      ) : tab === 'skills' ? (
        <SkillsContent />
      ) : tab === 'career' ? (
        <CareerContent />
      ) : tab === 'reflections' ? (
        <ReflectionsContent />
      ) : (
        <HomeContent />
      )}
      <LearnLogBottomNav />
    </>
  );
}
