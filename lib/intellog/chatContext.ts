// lib/intellog/chatContext.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCohortKey } from './cohort';
import { getAge } from '@/lib/age';

export interface SnapshotRow {
  app: string;
  date: string;
  metrics: Record<string, number>;
}

export interface CohortStatRow {
  app: string;
  metric: string;
  p25: number;
  p50: number;
  p75: number;
}

export interface ProfileAppContext {
  app: string;
  metrics: Record<string, number>;
  cohort: Record<string, { p25: number; p50: number; p75: number }>;
}

/**
 * Pure aggregation: latest snapshot metrics per app, with matching cohort
 * percentiles attached per metric. Rows are expected date-ascending (the
 * default Postgres order for these queries) so the last write per app wins.
 */
export function buildAppContexts(snapshots: SnapshotRow[], cohortStats: CohortStatRow[]): ProfileAppContext[] {
  const latestByApp = new Map<string, Record<string, number>>();
  for (const snap of snapshots) {
    latestByApp.set(snap.app, snap.metrics);
  }

  return Array.from(latestByApp.entries()).map(([app, metrics]) => ({
    app,
    metrics,
    cohort: Object.fromEntries(
      cohortStats
        .filter((c) => c.app === app)
        .map((c) => [c.metric, { p25: c.p25, p50: c.p50, p75: c.p75 }])
    ),
  }));
}

/**
 * Fetches this profile's last `windowDays` of snapshots plus today's
 * matching cohort stats, and assembles them via buildAppContexts. Shared by
 * the intel-suggest cron and the app-switcher chat route so both stay in
 * sync on what "context" means.
 */
export async function assembleProfileContext(
  supabase: SupabaseClient,
  profileId: string,
  windowDays = 30
): Promise<{ appContexts: ProfileAppContext[]; distinctDays: number }> {
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const [profileRes, snapshotsRes] = await Promise.all([
    supabase.from('profiles').select('dateOfBirth, country').eq('id', profileId).single(),
    supabase
      .from('intel_snapshots')
      .select('app, date, metrics')
      .eq('profileId', profileId)
      .gte('date', windowStart.toISOString().slice(0, 10)),
  ]);

  const snapshots = (snapshotsRes.data as SnapshotRow[]) || [];
  const distinctDays = new Set(snapshots.map((s) => s.date)).size;

  const { data: goalRow } = await supabase
    .from('fitness_goals')
    .select('goalType')
    .eq('profileId', profileId)
    .limit(1)
    .maybeSingle();

  const profileRow = profileRes.data as { dateOfBirth: string; country: string | null } | null;
  const age = profileRow?.dateOfBirth ? getAge(profileRow.dateOfBirth) : 30;
  const cohortKey = buildCohortKey((goalRow as { goalType: string } | null)?.goalType ?? null, age, profileRow?.country);

  const { data: cohortStats } = await supabase
    .from('intel_cohort_stats')
    .select('app, metric, p25, p50, p75')
    .eq('cohortKey', cohortKey)
    .eq('date', today.toISOString().slice(0, 10));

  return {
    appContexts: buildAppContexts(snapshots, (cohortStats as CohortStatRow[]) || []),
    distinctDays,
  };
}
