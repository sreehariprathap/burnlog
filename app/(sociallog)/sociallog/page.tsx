'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { HomeContent } from './_components/HomeContent';

const SearchContent = dynamic(() => import('./search/_components/SearchContent').then((m) => m.SearchContent), {
  loading: () => <TabLoading />,
});
const MessagesContent = dynamic(
  () => import('./messages/_components/MessagesContent').then((m) => m.MessagesContent),
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
 * /sociallog is a single page for all three of its nav tabs (Home, Search,
 * Messages) — see SocialLogBottomNav, which switches between them via
 * `?tab=` instead of navigating. /sociallog/messages/[threadId] (a
 * conversation's own page) stays a real, separate route — only the thread
 * list merged in.
 */
export default function SocialLogPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <SocialLogTabSwitcher />
    </Suspense>
  );
}

function SocialLogTabSwitcher() {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'home';

  return (
    <>
      {tab === 'search' || tab === 'search-topics' || tab === 'search-reels' ? (
        <SearchContent />
      ) : tab === 'messages' ? (
        <MessagesContent />
      ) : (
        <HomeContent />
      )}
      <SocialLogBottomNav />
    </>
  );
}
