'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { GlobalSearch } from '@/components/GlobalSearch';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { GreetingBanner } from '@/components/logbook/GreetingBanner';
import { DayScoreRing } from '@/components/logbook/DayScoreRing';
const LifeScoreTrend = dynamic(
  () => import('@/components/logbook/LifeScoreTrend').then((mod) => mod.LifeScoreTrend),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> }
);
import { LogCardsGrid } from '@/components/logbook/LogCardsGrid';
import { StreakBadge } from '@/components/logbook/StreakBadge';
import { MorningBrief } from '@/components/logbook/MorningBrief';
import { ActivityTimeline } from '@/components/logbook/ActivityTimeline';
import { CorrelationInsight } from '@/components/logbook/CorrelationInsight';
import { LearnLogSummaryCard } from '@/components/LearnLogSummaryCard';
import { StreakCalendar } from './_components/StreakCalendar';
import { WeeklySummary } from './_components/WeeklySummary';
import { QuickAddFab } from './_components/QuickAddFab';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';
import { createClient } from '@/lib/supabase/client';
import { todayQuery } from '@/lib/logbook/queries';

// Client Component — page metadata (title) is set via the root layout's
// default; add a Metadata export here if this is ever converted to a
// Server Component wrapper.

export default function LogbookPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(
    profile ? todayQuery().key : null,
    profile ? todayQuery().fetcher : null
  );
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const supabase = createClient();

  const loading = profileLoading || isLoading;

  async function handleModeChange(mode: LifeScoreMode) {
    if (!profile) return;
    const { error } = await supabase.from('profiles').update({ lifeScoreMode: mode }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not change mode', description: error.message, variant: 'destructive' });
      return;
    }
    await mutate();
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await mutate();
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : 'Could not refresh the logbook.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar
        title="Logbook"
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            aria-label="Refresh logbook"
            className="flex items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} />
          </button>
        }
      />

      <div className="mx-auto flex max-w-lg flex-col gap-5 p-4">
        {!profileLoading && profile && <GreetingBanner name={profile.firstName} />}

        <GlobalSearch />

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
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>Couldn&apos;t load today&apos;s logbook.</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </CardContent>
          </Card>
        )}

        {!loading && data && (
          <>
            <MorningBrief />

            <StatCard>
              <DayScoreRing
                score={data.dayScore}
                mode={data.lifeScoreMode}
                onModeChange={handleModeChange}
              />
            </StatCard>

            <LogCardsGrid cards={data.cards} />

            {profile && <LearnLogSummaryCard profileId={profile.id} />}

            <CorrelationInsight />

            <StreakBadge streak={data.streak} streakApps={data.streakApps} />

            <StreakCalendar />

            <WeeklySummary />

            <LifeScoreTrend mode={data.lifeScoreMode} />

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
