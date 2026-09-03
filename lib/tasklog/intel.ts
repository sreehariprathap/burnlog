// lib/tasklog/intel.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Summarizes a profile's TaskLog activity for the IntelLog snapshot pipeline. */
export async function extractTasklogSnapshot(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<Record<string, number>> {
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 7);

  const { data, error } = await supabase
    .from('tasklog_tasks')
    .select('completedAt')
    .eq('profileId', profileId)
    .gte('createdAt', windowStart.toISOString());
  if (error) throw error;

  const tasks = data ?? [];
  if (tasks.length === 0) return { completionRate: 0 };

  const completed = tasks.filter((t: { completedAt: string | null }) => t.completedAt !== null).length;
  return { completionRate: Math.round((completed / tasks.length) * 100) };
}
