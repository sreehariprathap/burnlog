// lib/tasklog/streak.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayDateString } from './types';

export interface StreakProfile {
  id: string;
  taskLogCurrentStreak: number;
  taskLogLongestStreak: number;
  lastTaskLogStreakDate: string | null;
}

/**
 * Call after any task completes. If every task due/planned for today is now
 * complete, and today hasn't already been counted, advances the streak.
 */
export async function maybeAdvanceTaskLogStreak(
  supabase: SupabaseClient,
  profile: StreakProfile
): Promise<void> {
  const today = todayDateString();
  if (profile.lastTaskLogStreakDate === today) return;

  const { data: todaysTasks } = await supabase
    .from('tasklog_tasks')
    .select('id, completedAt')
    .eq('profileId', profile.id)
    .or(`dueDate.eq.${today},plannedForToday.eq.true`);

  if (!todaysTasks || todaysTasks.length === 0) return;
  const allDone = todaysTasks.every((t: { completedAt: string | null }) => t.completedAt !== null);
  if (!allDone) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');
  const yesterdayStr = `${y}-${m}-${d}`;

  const wasConsecutive = profile.lastTaskLogStreakDate === yesterdayStr;
  const newCurrent = wasConsecutive ? profile.taskLogCurrentStreak + 1 : 1;
  const newLongest = Math.max(profile.taskLogLongestStreak, newCurrent);

  await supabase
    .from('profiles')
    .update({
      taskLogCurrentStreak: newCurrent,
      taskLogLongestStreak: newLongest,
      lastTaskLogStreakDate: today,
    })
    .eq('id', profile.id);
}
