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

// The real /signup/profile page (left completely unmodified — see the
// spec's non-goals) has no idea it's creating the test account's profile,
// so the row it inserts always gets isTestAccount's schema default: false.
// This looks the profile up by the test auth account's userId instead (the
// one thing that's unambiguous), and lazily backfills isTestAccount = true
// the first time it finds an untagged row — so every later read/delete can
// still trust that flag as its safety anchor, without ever touching the
// onboarding wizard.
export async function findTestProfile(
  admin: SupabaseClient
): Promise<{ id: string; userId: string } | null> {
  const { data: users } = await admin.auth.admin.listUsers();
  const testUserId = users?.users.find((u) => u.email === TEST_ONBOARDING_EMAIL)?.id;
  if (!testUserId) return null;

  const { data } = await admin
    .from('profiles')
    .select('id, userId, isTestAccount')
    .eq('userId', testUserId)
    .maybeSingle();
  if (!data) return null;

  if (!data.isTestAccount) {
    await admin.from('profiles').update({ isTestAccount: true }).eq('id', data.id);
  }

  return { id: data.id, userId: data.userId };
}
