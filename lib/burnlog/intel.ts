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

  const { data, error } = await supabase
    .from('workouts')
    .select('bodyPart')
    .eq('profileId', profileId)
    .gte('createdAt', windowStart.toISOString());
  if (error) throw error;

  const workoutsPerWeek = (data ?? []).filter((row: { bodyPart: string }) => row.bodyPart !== 'Rest').length;
  return { workoutsPerWeek };
}
