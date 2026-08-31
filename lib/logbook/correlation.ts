// lib/logbook/correlation.ts
//
// Cross-log correlation insight. There's no sleep/lifelog data model in this
// app yet, so this correlates the two daily series that do exist with a
// real historical trail — calories burned and tasks completed — rather than
// fabricating a sleep-vs-tasks claim with no data behind it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays, format as formatDate } from 'date-fns';

export interface LogbookCorrelation {
  available: boolean;
  headline: string | null;
  detail: string | null;
  sampleSize: number;
}

const LOOKBACK_DAYS = 30;
const MIN_DAYS_PER_BUCKET = 3;

function dayKey(d: Date | string): string {
  return formatDate(new Date(d), 'yyyy-MM-dd');
}

export async function getLogbookCorrelation(supabase: SupabaseClient, profileId: string): Promise<LogbookCorrelation> {
  const since = subDays(new Date(), LOOKBACK_DAYS).toISOString();
  const todayKey = dayKey(new Date());

  const [burnRes, taskRes] = await Promise.all([
    supabase.from('calorie_burns').select('date, caloriesBurned').eq('profileId', profileId).gte('date', since),
    supabase
      .from('tasklog_tasks')
      .select('completedAt')
      .eq('profileId', profileId)
      .not('completedAt', 'is', null)
      .gte('completedAt', since),
  ]);

  const burnByDay = new Map<string, number>();
  for (const r of (burnRes.data as { date: string; caloriesBurned: number }[]) || []) {
    const key = dayKey(r.date);
    burnByDay.set(key, (burnByDay.get(key) ?? 0) + (r.caloriesBurned || 0));
  }

  const tasksByDay = new Map<string, number>();
  for (const r of (taskRes.data as { completedAt: string }[]) || []) {
    const key = dayKey(r.completedAt);
    tasksByDay.set(key, (tasksByDay.get(key) ?? 0) + 1);
  }

  // Only compare days that are fully in the past — today is still in
  // progress and would unfairly drag down whichever bucket it lands in.
  const burnDays = [...burnByDay.entries()].filter(([day]) => day !== todayKey && burnByDay.get(day)! > 0);

  if (burnDays.length < MIN_DAYS_PER_BUCKET * 2) {
    return {
      available: false,
      headline: null,
      detail: null,
      sampleSize: burnDays.length,
    };
  }

  const sortedByBurn = [...burnDays].sort((a, b) => a[1] - b[1]);
  const medianIndex = Math.floor(sortedByBurn.length / 2);
  const lowBurnDays = sortedByBurn.slice(0, medianIndex);
  const highBurnDays = sortedByBurn.slice(medianIndex);

  if (lowBurnDays.length < MIN_DAYS_PER_BUCKET || highBurnDays.length < MIN_DAYS_PER_BUCKET) {
    return { available: false, headline: null, detail: null, sampleSize: burnDays.length };
  }

  const avgTasks = (days: [string, number][]) =>
    days.reduce((sum, [day]) => sum + (tasksByDay.get(day) ?? 0), 0) / days.length;

  const lowAvg = avgTasks(lowBurnDays);
  const highAvg = avgTasks(highBurnDays);
  const medianBurn = Math.round(sortedByBurn[medianIndex][1]);

  if (highAvg === 0 && lowAvg === 0) {
    return { available: false, headline: null, detail: null, sampleSize: burnDays.length };
  }

  const diffPct = lowAvg > 0 ? Math.round(((highAvg - lowAvg) / lowAvg) * 100) : null;
  const direction = highAvg >= lowAvg ? 'higher' : 'lower';
  const magnitude = diffPct !== null ? `${Math.abs(diffPct)}%` : `${Math.abs(highAvg - lowAvg).toFixed(1)} more`;

  const headline =
    Math.abs(highAvg - lowAvg) < 0.05
      ? `No clear link yet between workouts and task completion.`
      : `On days you burn ${medianBurn.toLocaleString()}+ kcal, task completion runs ${magnitude} ${direction}.`;

  return {
    available: true,
    headline,
    detail: `Based on ${burnDays.length} logged days over the last ${LOOKBACK_DAYS}.`,
    sampleSize: burnDays.length,
  };
}
