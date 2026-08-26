// lib/tasklog/completeTask.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { recomputeGoalProgress } from './goalProgress';
import { maybeAdvanceTaskLogStreak, type StreakProfile } from './streak';

interface CompletableTask {
  id: string;
  goalId: string | null;
}

/**
 * Single entry point for toggling a task's completion — used by the Board
 * and Dashboard so streak/goal-progress side effects never get missed.
 */
export async function markTaskComplete(
  supabase: SupabaseClient,
  task: CompletableTask,
  profile: StreakProfile,
  completed: boolean
): Promise<void> {
  await supabase
    .from('tasklog_tasks')
    .update({
      completedAt: completed ? new Date().toISOString() : null,
      lane: completed ? 'done' : undefined,
    })
    .eq('id', task.id);

  if (completed) {
    if (task.goalId) {
      await recomputeGoalProgress(supabase, task.goalId);
    }
    await maybeAdvanceTaskLogStreak(supabase, profile);
  }
}
