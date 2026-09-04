import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { buildCohortKey, computePercentiles, MIN_COHORT_SAMPLE_SIZE } from '@/lib/intellog/cohort';
import { getAge } from '@/lib/age';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const date = new Date().toISOString().slice(0, 10);

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, dateOfBirth, country');
  if (profilesError) {
    console.error('intel-cohort: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data: goals, error: goalsError } = await supabase.from('fitness_goals').select('profileId, goalType');
  if (goalsError) {
    console.error('intel-cohort: failed to load fitness goals', goalsError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  const goalTypeByProfile = new Map((goals ?? []).map((g: { profileId: string; goalType: string }) => [g.profileId, g.goalType]));

  const { data: snapshots, error: snapshotsError } = await supabase
    .from('intel_snapshots')
    .select('profileId, app, metrics')
    .eq('date', date);
  if (snapshotsError) {
    console.error('intel-cohort: failed to load snapshots', snapshotsError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const ageByProfile = new Map((profiles ?? []).map((p: { id: string; dateOfBirth: string }) => [p.id, getAge(p.dateOfBirth)]));
  const countryByProfile = new Map((profiles ?? []).map((p: { id: string; country: string | null }) => [p.id, p.country]));

  // group values by cohortKey|app|metric
  const groups = new Map<string, { cohortKey: string; app: string; metric: string; values: number[] }>();
  for (const snap of snapshots ?? []) {
    const age = ageByProfile.get(snap.profileId);
    if (age === undefined) continue;
    const cohortKey = buildCohortKey(goalTypeByProfile.get(snap.profileId) ?? null, age, countryByProfile.get(snap.profileId));

    for (const [metric, value] of Object.entries(snap.metrics as Record<string, number>)) {
      const groupKey = `${cohortKey}|${snap.app}|${metric}`;
      const group = groups.get(groupKey) ?? { cohortKey, app: snap.app, metric, values: [] as number[] };
      group.values.push(value);
      groups.set(groupKey, group);
    }
  }

  let statsWritten = 0;
  for (const group of groups.values()) {
    if (group.values.length < MIN_COHORT_SAMPLE_SIZE) continue;
    const percentiles = computePercentiles(group.values);
    if (!percentiles) continue;

    const { error } = await supabase.from('intel_cohort_stats').upsert(
      {
        cohortKey: group.cohortKey,
        app: group.app,
        metric: group.metric,
        date,
        p25: percentiles.p25,
        p50: percentiles.p50,
        p75: percentiles.p75,
        sampleSize: group.values.length,
      },
      { onConflict: 'cohortKey,app,metric,date' }
    );
    if (error) {
      console.error('intel-cohort: failed to write cohort stat', group.cohortKey, group.app, group.metric, error);
      continue;
    }
    statsWritten += 1;
  }

  return NextResponse.json({ cohortsConsidered: groups.size, statsWritten });
}
