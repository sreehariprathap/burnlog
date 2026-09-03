'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import useSWR from 'swr';
import { computeFreeWindows, type FreeWindow } from '@/lib/travellog/freeTime';
import { computeAverageMonthlySurplus } from '@/lib/travellog/affordability';
import { fetchUpcomingHolidays, type Holiday } from '@/lib/travellog/holidays';
import type { TripSuggestion } from '@/lib/travellog/suggestions';
import { WeeklyTripStack, type TripCardItem } from '@/components/travellog/WeeklyTripStack';
import { weeklySuggestionsQuery } from '@/lib/travellog/queries';

const HORIZON_DAYS = 60;

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export default function TravelLogSuggestionsPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [signalsLoading, setSignalsLoading] = useState(true);
  const [freeWindows, setFreeWindows] = useState<FreeWindow[]>([]);
  const [surplus, setSurplus] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [suggestions, setSuggestions] = useState<TripSuggestion[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: weeklySuggestions = [] } = useSWR<TripCardItem[]>(
    profile ? weeklySuggestionsQuery(profile.id).key : null,
    profile ? weeklySuggestionsQuery(profile.id).fetcher : null
  );

  useEffect(() => {
    if (!profile || !profile.country) {
      setSignalsLoading(false);
      return;
    }
    let cancelled = false;
    setSignalsLoading(true);

    (async () => {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + HORIZON_DAYS);
      const fromKey = from.toISOString().slice(0, 10);
      const toKey = to.toISOString().slice(0, 10);

      const [blocksRes, tasksRes, holidaysResult, surplusResult] = await Promise.all([
        supabase.from('myday_blocks').select('date').eq('profileId', profile.id).gte('date', fromKey).lte('date', toKey),
        supabase.from('tasklog_tasks').select('dueDate, completedAt').eq('profileId', profile.id).gte('dueDate', fromKey).lte('dueDate', toKey),
        fetchUpcomingHolidays(profile.country as string, from, HORIZON_DAYS),
        computeAverageMonthlySurplus(supabase, profile.id),
      ]);

      if (cancelled) return;

      const windows = computeFreeWindows(
        (blocksRes.data as { date: string }[]) || [],
        (tasksRes.data as { dueDate: string | null; completedAt: string | null }[]) || [],
        from,
        HORIZON_DAYS
      );

      setFreeWindows(windows);
      setHolidays(holidaysResult);
      setSurplus(surplusResult);
      setSignalsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, supabase]);

  function handlePlanWeeklyTrip(item: TripCardItem) {
    const params = new URLSearchParams({
      destination: item.destination,
      startDate: item.startDate,
      endDate: item.endDate,
    });
    router.push(`/travellog/plan?${params.toString()}`);
  }

  async function handleGenerate() {
    if (!profile) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/travellog/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freeWindows,
          averageMonthlySurplus: surplus,
          currency: (profile.currency as string) || 'USD',
          country: profile.country,
          holidays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
      setSuggestions(data.suggestions);
    } catch (err) {
      toast({
        title: 'Could not generate suggestions',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }

  function handlePlanTrip(s: TripSuggestion) {
    const params = new URLSearchParams({
      destination: s.destination,
      startDate: s.startDate,
      endDate: s.endDate,
      budget: String(s.estimatedCost),
      budgetCurrency: s.currency,
    });
    router.push(`/travellog/plan?${params.toString()}`);
  }

  const loading = profileLoading || signalsLoading;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Suggestions" />
      <div className="p-4 flex flex-col gap-4">
        {weeklySuggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">This week&apos;s picks</h2>
            <WeeklyTripStack items={weeklySuggestions} onSelect={handlePlanWeeklyTrip} />
          </div>
        )}
        {!profileLoading && !profile?.country ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Set your country to get trip suggestions.</p>
              <Button size="sm" onClick={() => router.push('/travellog/config')}>Go to Config</Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <Skeleton className="w-full h-32 rounded-lg" />
        ) : freeWindows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No free stretches found in the next {HORIZON_DAYS} days — suggestions need at least a couple of open days.
            </CardContent>
          </Card>
        ) : (
          <>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin w-5 h-5" /> : 'Refresh suggestions'}
            </Button>
            {suggestions?.map((s, i) => (
              <Card key={i}>
                <CardContent className="pt-4 flex flex-col gap-2">
                  <p className="font-medium">{s.destination}</p>
                  <p className="text-xs text-muted-foreground">{s.startDate} – {s.endDate}</p>
                  <p className="text-sm font-semibold text-primary">{formatCurrency(s.estimatedCost, s.currency)}</p>
                  <p className="text-sm text-muted-foreground">{s.rationale}</p>
                  <Button size="sm" onClick={() => handlePlanTrip(s)}>Plan this trip</Button>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
