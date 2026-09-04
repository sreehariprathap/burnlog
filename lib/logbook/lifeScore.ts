// lib/logbook/lifeScore.ts
import type { AppId } from '@/lib/appMode';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodRange, expandRecurringInRange, type RecurringItemRow } from '@/lib/financePeriods';
import { resolveTarget, DEFAULT_TARGETS } from '@/lib/dailyTargets';
import { getMyHouseholdMembership } from '@/lib/homelog/serverAuth';
import { format as formatDate, subDays } from 'date-fns';

export type LifeScoreApp = Exclude<AppId, 'logbook' | 'adminlog' | 'intellog' | 'watchlog'>;

export const LIFE_SCORE_APPS: LifeScoreApp[] = [
  'burnlog',
  'tasklog',
  'moneylog',
  'homelog',
  'sociallog',
  'shoppinglog',
  'travellog',
  'learnlog',
];

export type LifeScoreMode = 'engagement' | 'streak' | 'goal';

export interface AppScoreDay {
  engagement: number | null; // 0 or 100 — did they touch this app today
  streakPct: number | null;  // Math.min(100, currentStreak * 10), or null if no streak concept
  goalPct: number | null;    // progress toward this app's natural goal, or null if none
}

const MODE_KEY: Record<LifeScoreMode, keyof AppScoreDay> = {
  engagement: 'engagement',
  streak: 'streakPct',
  goal: 'goalPct',
};

/**
 * Average one mode's values across enabled apps, skipping apps with no
 * value for that mode. Null if no enabled app has a value.
 */
export function averageMode(
  dayScores: Partial<Record<LifeScoreApp, AppScoreDay>>,
  mode: LifeScoreMode,
  enabledApps: LifeScoreApp[]
): number | null {
  const key = MODE_KEY[mode];
  const values = enabledApps
    .map((app) => dayScores[app]?.[key])
    .filter((v): v is number => v !== null && v !== undefined);

  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function streakToPct(currentStreak: number): number {
  return Math.min(100, currentStreak * 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function scoreBurnlog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [goalsRes, burnRes, foodRes, profileRes] = await Promise.all([
    supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
    supabase.from('food_intakes').select('id').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
    supabase.from('profiles').select('currentStreak').eq('id', profileId).single(),
  ]);

  const goals = (goalsRes.data as { goalType: string; targetValue: number }[]) || [];
  const target = resolveTarget(goals, 'calories_burned') || DEFAULT_TARGETS.calories_burned;
  const burned = ((burnRes.data as { caloriesBurned: number }[]) || []).reduce((s, r) => s + (r.caloriesBurned || 0), 0);
  const touchedToday = burned > 0 || ((foodRes.data as unknown[]) || []).length > 0;
  const currentStreak = (profileRes.data as { currentStreak: number } | null)?.currentStreak ?? 0;

  return {
    engagement: touchedToday ? 100 : 0,
    streakPct: streakToPct(currentStreak),
    goalPct: target > 0 ? Math.min(100, Math.round((burned / target) * 100)) : null,
  };
}

async function scoreTasklog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }, dayStr: string): Promise<AppScoreDay> {
  const [taskRes, profileRes] = await Promise.all([
    supabase.from('tasklog_tasks').select('id, completedAt').eq('profileId', profileId).or(`dueDate.eq.${dayStr},plannedForToday.eq.true`),
    supabase.from('profiles').select('taskLogCurrentStreak').eq('id', profileId).single(),
  ]);

  const rows = (taskRes.data as { id: string; completedAt: string | null }[]) || [];
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;
  const currentStreak = (profileRes.data as { taskLogCurrentStreak: number } | null)?.taskLogCurrentStreak ?? 0;

  return {
    engagement: completed > 0 ? 100 : 0,
    streakPct: streakToPct(currentStreak),
    goalPct: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

async function scoreMoneylog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const monthRange = getPeriodRange('monthly');
  const [recurringRes, txRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase.from('finance_transactions').select('type, amount').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const monthlyExpenseItems = expandRecurringInRange(recurringItems, monthRange.start, monthRange.end).filter((i) => i.type === 'expense');
  const monthlyExpenseTotal = monthlyExpenseItems.reduce((s, i) => s + i.amount, 0);
  const daysInMonth = Math.round((monthRange.end.getTime() - monthRange.start.getTime()) / DAY_MS) || 30;
  const dailyBudget = monthlyExpenseTotal > 0 ? monthlyExpenseTotal / daysInMonth : 0;

  const txRows = (txRes.data as { type: string; amount: number }[]) || [];
  const spentToday = txRows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return {
    engagement: txRows.length > 0 ? 100 : 0,
    streakPct: null,
    goalPct: dailyBudget > 0 ? Math.max(0, Math.min(100, Math.round(((dailyBudget - spentToday) / dailyBudget) * 100))) : null,
  };
}

async function scoreHomelog(supabase: SupabaseClient, profileId: string, dayStr: string): Promise<AppScoreDay> {
  const membership = await getMyHouseholdMembership(supabase, profileId);
  if (!membership) return { engagement: null, streakPct: null, goalPct: null };

  const { data } = await supabase
    .from('household_chore_instances')
    .select('id, completedAt')
    .eq('assignedProfileId', profileId)
    .eq('dueDate', dayStr);

  const rows = (data as { id: string; completedAt: string | null }[]) || [];
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;

  return {
    engagement: completed > 0 ? 100 : 0,
    streakPct: null,
    goalPct: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

async function scoreSociallog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [postRes, msgRes] = await Promise.all([
    supabase.from('social_posts').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('social_messages').select('id').eq('senderId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
  ]);

  const touchedToday = ((postRes.data as unknown[]) || []).length > 0 || ((msgRes.data as unknown[]) || []).length > 0;

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct: null };
}

async function scoreShoppinglog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [orderRes, listingRes] = await Promise.all([
    supabase.from('shop_orders').select('id').or(`buyerId.eq.${profileId},sellerId.eq.${profileId}`).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('shop_listings').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
  ]);

  const touchedToday = ((orderRes.data as unknown[]) || []).length > 0 || ((listingRes.data as unknown[]) || []).length > 0;

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct: null };
}

async function scoreTravellog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [visitRes, planRes] = await Promise.all([
    supabase.from('travellog_visits').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('travellog_plans').select('id').eq('profileId', profileId).eq('status', 'accepted').order('createdAt', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const touchedToday = ((visitRes.data as unknown[]) || []).length > 0;

  let goalPct: number | null = null;
  const activePlan = planRes.data as { id: string } | null;
  if (activePlan) {
    const { data: taskRows } = await supabase.from('tasklog_tasks').select('id, completedAt').eq('travelPlanId', activePlan.id);
    const rows = (taskRows as { id: string; completedAt: string | null }[]) || [];
    if (rows.length > 0) {
      goalPct = Math.round((rows.filter((r) => r.completedAt).length / rows.length) * 100);
    }
  }

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct };
}

async function scoreLearnlog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [sessionRes, reflectionRes, skillsRes, inProgressRes] = await Promise.all([
    supabase.from('learnlog_skill_sessions').select('id, skillId').gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('learnlog_reflections').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('learnlog_skills').select('id, currentStreak').eq('profileId', profileId),
    supabase.from('learnlog_library_items').select('progressPercent').eq('profileId', profileId).eq('status', 'IN_PROGRESS'),
  ]);

  // SkillSession has no profileId column — filter sessions to this profile's skills.
  const mySkillIds = new Set((((skillsRes.data as { id?: string }[]) || [])).map((s) => s.id));
  const sessionRows = (sessionRes.data as { id: string; skillId: string }[]) || [];
  const touchedViaSession = sessionRows.some((r) => mySkillIds.has(r.skillId));
  const touchedToday = touchedViaSession || ((reflectionRes.data as unknown[]) || []).length > 0;

  const streaks = ((skillsRes.data as { currentStreak: number }[]) || []).map((s) => s.currentStreak);
  const streakPct = streaks.length > 0 ? Math.round(streaks.reduce((s, v) => s + streakToPct(v), 0) / streaks.length) : null;

  const inProgress = (inProgressRes.data as { progressPercent: number }[]) || [];
  const goalPct = inProgress.length > 0 ? Math.round(inProgress.reduce((s, i) => s + i.progressPercent, 0) / inProgress.length) : null;

  return { engagement: touchedToday ? 100 : 0, streakPct, goalPct };
}

/**
 * Compute every enabled-relevant app's score for one day in parallel.
 * Callers filter by profile.enabledApps via averageMode — this always
 * computes all 8 apps since most queries are cheap and app-enablement
 * can change between reads.
 */
export async function computeAppScoresForDay(
  supabase: SupabaseClient,
  profileId: string,
  range: { start: string; end: string },
  dayStr: string
): Promise<Record<LifeScoreApp, AppScoreDay>> {
  const [burnlog, tasklog, moneylog, homelog, sociallog, shoppinglog, travellog, learnlog] = await Promise.all([
    scoreBurnlog(supabase, profileId, range),
    scoreTasklog(supabase, profileId, range, dayStr),
    scoreMoneylog(supabase, profileId, range),
    scoreHomelog(supabase, profileId, dayStr),
    scoreSociallog(supabase, profileId, range),
    scoreShoppinglog(supabase, profileId, range),
    scoreTravellog(supabase, profileId, range),
    scoreLearnlog(supabase, profileId, range),
  ]);

  return { burnlog, tasklog, moneylog, homelog, sociallog, shoppinglog, travellog, learnlog };
}

function rangeForDate(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = subDays(start, -1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Lazily compute-and-store a snapshot for a past date (never "today").
 * Idempotent via the profileId+date unique constraint.
 */
export async function getOrCreateSnapshotForDate(
  supabase: SupabaseClient,
  profileId: string,
  date: string,
  enabledApps: LifeScoreApp[]
) {
  const { data: existing } = await supabase
    .from('life_score_snapshots')
    .select('date, engagementScore, streakScore, goalScore')
    .eq('profileId', profileId)
    .eq('date', date)
    .maybeSingle();

  if (existing) return existing;

  const range = rangeForDate(date);
  const dayScores = await computeAppScoresForDay(supabase, profileId, range, date);

  const engagementScore = averageMode(dayScores, 'engagement', enabledApps);
  const streakScore = averageMode(dayScores, 'streak', enabledApps);
  const goalScore = averageMode(dayScores, 'goal', enabledApps);

  const { data: inserted, error } = await supabase
    .from('life_score_snapshots')
    .upsert(
      { profileId, date, engagementScore, streakScore, goalScore },
      { onConflict: 'profileId,date' }
    )
    .select('date, engagementScore, streakScore, goalScore')
    .single();

  if (error) throw error;
  return inserted;
}

export async function getLifeScoreTrend(supabase: SupabaseClient, profileId: string, days = 30) {
  const since = formatDate(subDays(new Date(), days), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('life_score_snapshots')
    .select('date, engagementScore, streakScore, goalScore')
    .eq('profileId', profileId)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data as Array<{ date: string; engagementScore: number | null; streakScore: number | null; goalScore: number | null }>) || [];
}
