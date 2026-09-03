// lib/burnlog/intel.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Summarizes a profile's BurnLog activity for the IntelLog snapshot pipeline.
 * `date` is the snapshot date (YYYY-MM-DD); the trailing-7-day window ends on it.
 */
export async function extractBurnlogSnapshot(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<Record<string, number>> {
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 7);
  const windowStartIso = windowStart.toISOString();

  // Completed sessions live in `sessions.sessionData` (a Json blob written by
  // CompletionTracker), not the legacy free-text `workouts` table — nothing
  // in the app writes to `workouts`, so counting from it always returned 0.
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('sessionData')
    .eq('profileId', profileId)
    .gte('date', windowStartIso);
  if (sessionsError) throw sessionsError;

  const workoutsPerWeek = (sessions ?? []).filter(
    (row: { sessionData: { completed?: boolean } }) => row.sessionData?.completed
  ).length;

  const { data: calorieBurns, error: calorieError } = await supabase
    .from('calorie_burns')
    .select('caloriesBurned')
    .eq('profileId', profileId)
    .gte('date', windowStartIso);
  if (calorieError) throw calorieError;

  const caloriesBurnedPerWeek = (calorieBurns ?? []).reduce(
    (sum: number, row: { caloriesBurned: number }) => sum + row.caloriesBurned,
    0
  );

  return { workoutsPerWeek, caloriesBurnedPerWeek };
}
