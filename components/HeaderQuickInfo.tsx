// components/HeaderQuickInfo.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GlobalSearch } from '@/components/GlobalSearch';
import { StreakBadge } from '@/components/logbook/StreakBadge';
import { LogCardsGrid } from '@/components/logbook/LogCardsGrid';
import { ActivityTimeline } from '@/components/logbook/ActivityTimeline';
import { AiJobsList } from '@/components/logbook/AiJobsList';
import { QuickGlanceChat } from '@/components/logbook/QuickGlanceChat';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import type { LogbookToday } from '@/lib/logbook/today';

async function fetchLogbookToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

const RECENT_ACTIVITY_COUNT = 5;

/**
 * Header toggle shown on every non-LogBook page — opens a bottom sheet with
 * the same cross-app streak/cards/activity data LogBook's own hub shows, so
 * you get a quick glance without leaving the app you're in. Not rendered on
 * the LogBook hub itself, since that page already is this view.
 */
export function HeaderQuickInfo() {
  const [open, setOpen] = useState(false);
  const { profile } = useCurrentProfile();
  // Shares the 'logbook-today' SWR cache key with the LogBook hub page —
  // whichever loads first warms it for the other during the session.
  const { data, isLoading } = useSWR(open ? 'logbook-today' : null, fetchLogbookToday);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick glance"
        className="flex items-center justify-center"
      >
        <Zap size={20} />
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>Quick Glance</DrawerTitle>
          </DrawerHeader>
          <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className={cn('mx-4 grid', profile?.isAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai-chat">AI Chat</TabsTrigger>
              {profile?.isAdmin && <TabsTrigger value="ai-jobs">AI Jobs</TabsTrigger>}
            </TabsList>
            <TabsContent value="overview" className="flex flex-col gap-5 overflow-y-auto p-4 pb-8">
              <GlobalSearch onNavigate={() => setOpen(false)} />
              {isLoading || !data ? (
                <>
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-xl" />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <StreakBadge streak={data.streak} streakApps={data.streakApps} />
                  <LogCardsGrid cards={data.cards} />
                  <div>
                    <h2 className="mb-2 text-sm font-semibold">Today&apos;s activity</h2>
                    <ActivityTimeline events={data.activity.slice(-RECENT_ACTIVITY_COUNT)} />
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="ai-chat" className="overflow-y-auto p-4 pb-8">
              <QuickGlanceChat onNavigate={() => setOpen(false)} />
            </TabsContent>
            {profile?.isAdmin && (
              <TabsContent value="ai-jobs" className="overflow-y-auto p-4 pb-8">
                <AiJobsList />
              </TabsContent>
            )}
          </Tabs>
        </DrawerContent>
      </Drawer>
    </>
  );
}
