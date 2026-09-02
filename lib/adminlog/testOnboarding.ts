// lib/adminlog/testOnboarding.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export const TEST_ONBOARDING_EMAIL =
  process.env.ADMINLOG_TEST_ONBOARDING_EMAIL || 'adminlog.test.onboarding@gmail.com';

// Child-first order: every table a row here references must already be
// gone (or never existed) by the time we reach it. Onboarding wizards only
// ever write these; the profiles row itself is deleted last, separately.
export const TEST_ONBOARDING_TABLES: ReadonlyArray<{ table: string; label: string }> = [
  { table: 'tasklog_tasks', label: 'TaskLog tasks' },
  { table: 'task_goals', label: 'TaskLog goals' },
  { table: 'recurring_items', label: 'MoneyLog recurring items' },
  { table: 'workout_plans', label: 'BurnLog workout plan' },
  { table: 'learnlog_skill_sessions', label: 'LearnLog skill sessions' },
  { table: 'learnlog_skill_milestones', label: 'LearnLog skill milestones' },
  { table: 'learnlog_skills', label: 'LearnLog skills' },
  { table: 'learnlog_career_goals', label: 'LearnLog career goals' },
  { table: 'learnlog_library_items', label: 'LearnLog library items' },
  { table: 'household_chores', label: 'HomeLog chores' },
];

export async function requireAdminCaller(
  supabase: SupabaseClient
): Promise<{ id: string; userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, userId, isAdmin')
    .eq('userId', user.id)
    .single();

  if (!profile?.isAdmin) return null;
  return { id: profile.id, userId: profile.userId };
}

export async function findTestProfile(
  admin: SupabaseClient
): Promise<{ id: string; userId: string } | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, userId')
    .eq('isTestAccount', true)
    .maybeSingle();
  return data ?? null;
}
