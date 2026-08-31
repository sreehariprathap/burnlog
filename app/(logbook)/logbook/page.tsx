'use client';

import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { DayScoreRing } from '@/components/logbook/DayScoreRing';
import { LogCardsGrid } from '@/components/logbook/LogCardsGrid';
import { StreakBadge } from '@/components/logbook/StreakBadge';
import { MorningBrief } from '@/components/logbook/MorningBrief';
import { ActivityTimeline } from '@/components/logbook/ActivityTimeline';
import { StreakCalendar } from './_components/StreakCalendar';
import { WeeklySummary } from './_components/WeeklySummary';
import { QuickAddFab } from './_components/QuickAddFab';
import type { LogbookToday } from '@/lib/logbook/today';

async function fetchLogbookToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

export default function LogbookPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(profile ? 'logbook-today' : null, fetchLogbookToday);

  const loading = profileLoading || isLoading;

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar title="Logbook" />

      <div className="mx-auto flex max-w-lg flex-col gap-5 p-4">
        {loading && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Skeleton className="h-44 w-44 rounded-full" />
            <div className="grid w-full grid-cols-2 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load today&apos;s logbook. Try refreshing.
            </CardContent>
          </Card>
        )}

        {!loading && data && (
          <>
            <MorningBrief
              yesterdayScore={data.yesterdayScore}
              insight={data.insight}
              burnTarget={data.cards.find((c) => c.app === 'burnlog')?.target ?? 0}
              taskTarget={data.cards.find((c) => c.app === 'tasklog')?.target ?? 0}
              budgetTarget={data.cards.find((c) => c.app === 'moneylog')?.target ?? 0}
            />

            <Card>
              <CardContent className="pt-6">
                <DayScoreRing score={data.dayScore} />
              </CardContent>
            </Card>

            <LogCardsGrid cards={data.cards} />

            <StreakBadge streak={data.streak} streakApps={data.streakApps} />

            <StreakCalendar />

            <WeeklySummary />

            <div>
              <h2 className="mb-2 text-sm font-semibold">Today&apos;s activity</h2>
              <ActivityTimeline events={data.activity} />
            </div>
          </>
        )}
      </div>

      {profile && <QuickAddFab profileId={profile.id} onSaved={() => mutate()} />}

      <LogbookBottomNav />
    </div>
  );
}
