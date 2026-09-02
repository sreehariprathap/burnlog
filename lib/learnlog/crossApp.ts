// lib/learnlog/crossApp.ts
import { createClient } from '@/lib/supabase/client';

/** Creates a TaskLog task sourced from a LearnLog item — mirrors how TravelLog's
 * Plan flow creates logistics/day tasks (no formal FK back to LearnLog; the
 * notes field carries the back-reference, matching the low-friction pattern
 * used elsewhere for cross-app task creation). */
export async function createTaskLogTask(
  profileId: string,
  title: string,
  category: 'life' | 'work',
  sourceLabel: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('tasks').insert({
    profileId,
    title,
    category,
    priority: 'medium',
    notes: `From LearnLog · ${sourceLabel}`,
  });
  if (error) throw error;
}
