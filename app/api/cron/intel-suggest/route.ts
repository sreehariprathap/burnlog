import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { generateIntelSuggestions, type SuggestionInput } from '@/lib/ai/intelSuggestions';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { buildCohortKey } from '@/lib/intellog/cohort';

const MIN_HISTORY_DAYS = 7;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const model = await getModel(supabase, 'text');
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 30);

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, age');
  if (profilesError) {
    console.error('intel-suggest: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data: goals } = await supabase.from('fitness_goals').select('profileId, goalType');
  const goalTypeByProfile = new Map((goals ?? []).map((g: { profileId: string; goalType: string }) => [g.profileId, g.goalType]));

  let suggestionsWritten = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles ?? []) {
    try {
      const { data: snapshots, error: snapError } = await supabase
        .from('intel_snapshots')
        .select('app, date, metrics')
        .eq('profileId', profile.id)
        .gte('date', windowStart.toISOString().slice(0, 10));
      if (snapError) throw snapError;

      const distinctDays = new Set((snapshots ?? []).map((s: { date: string }) => s.date));
      if (distinctDays.size < MIN_HISTORY_DAYS) {
        skipped += 1;
        continue;
      }

      // latest metrics per app
      const latestByApp = new Map<string, Record<string, number>>();
      for (const snap of (snapshots ?? []) as { app: string; date: string; metrics: Record<string, number> }[]) {
        latestByApp.set(snap.app, snap.metrics); // rows arrive date-ascending from Postgres's default order; last write wins
      }

      const cohortKey = buildCohortKey(goalTypeByProfile.get(profile.id) ?? null, profile.age);
      const { data: cohortStats } = await supabase
        .from('intel_cohort_stats')
        .select('app, metric, p25, p50, p75')
        .eq('cohortKey', cohortKey)
        .eq('date', today.toISOString().slice(0, 10));

      const input: SuggestionInput[] = Array.from(latestByApp.entries()).map(([app, metrics]) => ({
        app,
        kind: app,
        metrics,
        cohort: Object.fromEntries(
          (cohortStats ?? [])
            .filter((c: { app: string }) => c.app === app)
            .map((c: { metric: string; p25: number; p50: number; p75: number }) => [c.metric, { p25: c.p25, p50: c.p50, p75: c.p75 }])
        ),
      }));

      const suggestions = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'intel-suggest', app: 'intellog', model },
        input,
        () => generateIntelSuggestions(input, model)
      );

      for (const suggestion of suggestions) {
        const { error } = await supabase.from('intel_suggestions').insert({
          profileId: profile.id,
          app: suggestion.app,
          kind: suggestion.kind,
          title: suggestion.title,
          body: suggestion.body,
          deepLink: suggestion.deepLink,
          status: 'new',
        });
        if (error) throw error;
        suggestionsWritten += 1;
      }
    } catch (err) {
      console.error(`intel-suggest: failed for profile ${profile.id}:`, err);
      errors += 1;
    }
  }

  return NextResponse.json({ profilesProcessed: (profiles ?? []).length, suggestionsWritten, skipped, errors });
}
