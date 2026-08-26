// lib/tasklog/goalProgress.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Marks a goal 'completed' once every linked task is done. No-op for goals
 * with zero linked tasks (nothing to complete yet).
 */
export async function recomputeGoalProgress(supabase: SupabaseClient, goalId: string): Promise<void> {
  const { data: tasks } = await supabase
    .from('tasklog_tasks')
    .select('id, completedAt')
    .eq('goalId', goalId);

  if (!tasks || tasks.length === 0) return;
  const allDone = tasks.every((t: { completedAt: string | null }) => t.completedAt !== null);
  if (allDone) {
    await supabase.from('task_goals').update({ status: 'completed' }).eq('id', goalId);
  }
}
