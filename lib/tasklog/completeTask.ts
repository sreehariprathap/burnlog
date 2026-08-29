// lib/tasklog/completeTask.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { recomputeGoalProgress } from './goalProgress';
import { maybeAdvanceTaskLogStreak, type StreakProfile } from './streak';

interface CompletableTask {
  id: string;
  goalId: string | null;
  title?: string;
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

    fetch('/api/sociallog/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceApp: 'tasklog',
        sourceRefType: 'task_completed',
        sourceRefId: task.id,
        body: task.title ? `Completed "${task.title}"` : 'Completed a task',
      }),
    }).catch(() => {
      // Best-effort — a failed activity post must never block task completion.
    });
  }
}
