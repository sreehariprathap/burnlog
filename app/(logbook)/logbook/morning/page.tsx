'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Sunrise, Flame, ListChecks, Wallet } from 'lucide-react';
import { appSearchColor } from '@/lib/search/registry';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { CorrelationInsight } from '@/components/logbook/CorrelationInsight';
import { dismissMorningBriefToday } from '@/lib/logbook/morningDismiss';
import { formatCalories, formatCurrency } from '@/lib/format';
import type { LogbookToday } from '@/lib/logbook/today';

// Client Component — no static <Metadata> export; this page is reached via
// in-app navigation only, so the parent /logbook title carries over.

async function fetchLogbookToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up early';
  if (hour < 12) return 'Good morning';
  return 'Good afternoon';
}

export default function MorningBriefPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(profile ? 'logbook-today' : null, fetchLogbookToday);

  // Landing on this page counts as having seen today's brief, whether the
  // visit came from the /logbook teaser or a direct link.
  useEffect(() => {
    dismissMorningBriefToday();
  }, []);

  const loading = profileLoading || isLoading;

  const burnTarget = data?.cards.find((c) => c.app === 'burnlog')?.target ?? 0;
  const taskTarget = data?.cards.find((c) => c.app === 'tasklog')?.target ?? 0;
  const budgetTarget = data?.cards.find((c) => c.app === 'moneylog')?.target ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Morning Brief" onClose={() => router.push('/logbook')} />

      <div className="mx-auto flex max-w-lg flex-col gap-5 p-4">
        <div className="flex items-start gap-3 rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4">
          <Sunrise className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="text-lg font-semibold">
              {greeting()}
              {profile?.firstName ? `, ${profile.firstName}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">Here&apos;s where you stand today.</p>
          </div>
        </div>

        {loading ? (
          <>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Yesterday&apos;s Day Score</p>
                  <p className="text-3xl font-bold tabular-nums">{data?.yesterdayScore ?? '—'}</p>
                </div>
                {data?.yesterdayScore !== null && data?.yesterdayScore !== undefined && (
                  <p className="max-w-[55%] text-right text-xs text-muted-foreground">{data.insight}</p>
                )}
              </CardContent>
            </Card>

            <CorrelationInsight />

            <div>
              <h2 className="mb-2 text-sm font-semibold">Today&apos;s targets</h2>
              <Card>
                <CardContent className="divide-y p-0">
                  <div className="flex items-center gap-3 p-4">
                    <Flame className="h-4 w-4" style={{ color: appSearchColor('burnlog') }} />
                    <span className="flex-1 text-sm">Calories burned</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCalories(burnTarget)}</span>
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <ListChecks className="h-4 w-4" style={{ color: appSearchColor('tasklog') }} />
                    <span className="flex-1 text-sm">Tasks planned</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {taskTarget > 0 ? `${taskTarget} task${taskTarget === 1 ? '' : 's'}` : 'None yet'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <Wallet className="h-4 w-4" style={{ color: appSearchColor('moneylog') }} />
                    <span className="flex-1 text-sm">Daily budget</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {budgetTarget > 0 ? formatCurrency(Math.round(budgetTarget)) : 'Not set'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button className="w-full" onClick={() => router.push('/logbook')}>
              Start the day
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
