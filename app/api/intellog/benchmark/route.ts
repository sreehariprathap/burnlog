import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { buildCohortKey } from '@/lib/intellog/cohort';
import { mergeBenchmarkSeries, type OwnPoint, type CohortPoint } from '@/lib/intellog/benchmark';

const WINDOW_DAYS = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const app = searchParams.get('app');
    const metric = searchParams.get('metric');
    if (!app || !metric) {
      return NextResponse.json({ error: 'Missing app or metric query param' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, age')
      .eq('userId', user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: goal } = await admin
      .from('fitness_goals')
      .select('goalType')
      .eq('profileId', profile.id)
      .maybeSingle();
    const cohortKey = buildCohortKey(goal?.goalType ?? null, profile.age);

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const windowStartDate = windowStart.toISOString().slice(0, 10);

    const { data: snapshots } = await admin
      .from('intel_snapshots')
      .select('date, metrics')
      .eq('profileId', profile.id)
      .eq('app', app)
      .gte('date', windowStartDate);

    const own: OwnPoint[] = (snapshots ?? [])
      .map((s: { date: string; metrics: Record<string, number> }) => ({ date: s.date, value: s.metrics[metric] }))
      .filter((p: OwnPoint) => typeof p.value === 'number');

    const { data: cohortStats } = await admin
      .from('intel_cohort_stats')
      .select('date, p25, p50, p75')
      .eq('cohortKey', cohortKey)
      .eq('app', app)
      .eq('metric', metric)
      .gte('date', windowStartDate);

    const cohort: CohortPoint[] = (cohortStats ?? []) as CohortPoint[];

    return NextResponse.json({ points: mergeBenchmarkSeries(own, cohort) });
  } catch (error) {
    console.error('intellog benchmark error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
