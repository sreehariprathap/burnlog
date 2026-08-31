// lib/logbook/today.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays, format as formatDate } from 'date-fns';
import { getPeriodRange, expandRecurringInRange, type RecurringItemRow } from '@/lib/financePeriods';
import { getTodayRange, resolveTarget, DEFAULT_TARGETS } from '@/lib/dailyTargets';
import { getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export interface LogbookCard {
  app: 'burnlog' | 'tasklog' | 'moneylog' | 'lifelog';
  label: string;
  value: number;
  target: number;
  unit: string;
  pct: number | null; // null = no target/data to compare against
  available: boolean; // false = feature not built yet (lifelog)
}

export interface LogbookActivityEvent {
  app: 'burnlog' | 'tasklog' | 'moneylog' | 'homelog';
  time: string; // ISO
  label: string;
}

export interface LogbookToday {
  dayScore: number | null;
  yesterdayScore: number | null;
  cards: LogbookCard[];
  streak: number;
  streakApps: string[];
  insight: string;
  activity: LogbookActivityEvent[];
}

const STREAK_LOOKBACK_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date | string): string {
  return formatDate(new Date(d), 'yyyy-MM-dd');
}

function getYesterdayRange(): { start: string; end: string } {
  const { start } = getTodayRange();
  const end = start;
  const startDate = subDays(new Date(start), 1);
  return { start: startDate.toISOString(), end };
}

async function computeYesterdayScore(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { start, end } = getYesterdayRange();

  // plannedForToday always means "today", so it can't identify yesterday's planned
  // tasks in hindsight — dueDate is the only historically-stable signal available.
  const [goalsRes, burnRes, taskRes] = await Promise.all([
    supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', start).lt('date', end),
    supabase.from('tasklog_tasks').select('id, completedAt').eq('profileId', profileId).eq('dueDate', dayKey(start)),
  ]);

  const goals = (goalsRes.data as { goalType: string; targetValue: number }[]) || [];
  const target = resolveTarget(goals, 'calories_burned') || DEFAULT_TARGETS.calories_burned;
  const burned = ((burnRes.data as { caloriesBurned: number }[]) || []).reduce((s, r) => s + (r.caloriesBurned || 0), 0);
  const burnPct = target > 0 ? Math.min(100, Math.round((burned / target) * 100)) : null;

  const taskRows = (taskRes.data as { id: string; completedAt: string | null }[]) || [];
  const taskPct = taskRows.length > 0 ? Math.round((taskRows.filter((r) => r.completedAt).length / taskRows.length) * 100) : null;

  const components = [burnPct, taskPct].filter((p): p is number => p !== null);
  return components.length > 0 ? Math.round(components.reduce((s, p) => s + p, 0) / components.length) : null;
}

async function computeBurnlogCard(supabase: SupabaseClient, profileId: string): Promise<{ card: LogbookCard; burnedToday: number }> {
  const { start, end } = getTodayRange();
  const [goalsRes, burnRes] = await Promise.all([
    supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', start).lt('date', end),
  ]);
  const goals = (goalsRes.data as { goalType: string; targetValue: number }[]) || [];
  const target = resolveTarget(goals, 'calories_burned') || DEFAULT_TARGETS.calories_burned;
  const burned = ((burnRes.data as { caloriesBurned: number }[]) || []).reduce((s, r) => s + (r.caloriesBurned || 0), 0);

  return {
    burnedToday: burned,
    card: {
      app: 'burnlog',
      label: 'Calories burned',
      value: burned,
      target,
      unit: 'kcal',
      pct: target > 0 ? Math.min(100, Math.round((burned / target) * 100)) : null,
      available: true,
    },
  };
}

async function computeTasklogCard(
  supabase: SupabaseClient,
  profileId: string,
  today: string
): Promise<{ card: LogbookCard; completed: number; total: number }> {
  const { data } = await supabase
    .from('tasklog_tasks')
    .select('id, completedAt')
    .eq('profileId', profileId)
    .or(`dueDate.eq.${today},plannedForToday.eq.true`);

  const rows = (data as { id: string; completedAt: string | null }[]) || [];
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;

  return {
    completed,
    total,
    card: {
      app: 'tasklog',
      label: "Today's tasks",
      value: completed,
      target: total,
      unit: 'tasks',
      pct: total > 0 ? Math.round((completed / total) * 100) : null,
      available: true,
    },
  };
}

async function computeMoneylogCard(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ card: LogbookCard; spentToday: number }> {
  const { start, end } = getTodayRange();
  const monthRange = getPeriodRange('monthly');

  const [recurringRes, transactionsRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase
      .from('finance_transactions')
      .select('type, amount, date')
      .eq('profileId', profileId)
      .gte('date', start)
      .lt('date', end),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const monthlyExpenseItems = expandRecurringInRange(recurringItems, monthRange.start, monthRange.end).filter(
    (i) => i.type === 'expense'
  );
  const monthlyExpenseTotal = monthlyExpenseItems.reduce((s, i) => s + i.amount, 0);
  const daysInMonth = Math.round((monthRange.end.getTime() - monthRange.start.getTime()) / DAY_MS) || 30;
  const dailyBudget = monthlyExpenseTotal > 0 ? monthlyExpenseTotal / daysInMonth : 0;

  const spentToday = ((transactionsRes.data as { type: string; amount: number }[]) || [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  return {
    spentToday,
    card: {
      app: 'moneylog',
      label: 'Spent today',
      value: spentToday,
      target: dailyBudget,
      unit: '₹',
      pct: dailyBudget > 0 ? Math.max(0, Math.min(100, Math.round(((dailyBudget - spentToday) / dailyBudget) * 100))) : null,
      available: true,
    },
  };
}

function lifelogCard(): LogbookCard {
  return {
    app: 'lifelog',
    label: 'Sleep last night',
    value: 0,
    target: 8,
    unit: 'hrs',
    pct: null,
    available: false,
  };
}

async function computeStreak(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ streak: number; streakApps: string[] }> {
  const since = subDays(new Date(), STREAK_LOOKBACK_DAYS).toISOString();
  const membership = await getMyHouseholdMembership(supabase, profileId);

  const [burnRes, foodRes, taskRes, txRes, choreRes] = await Promise.all([
    supabase.from('calorie_burns').select('date').eq('profileId', profileId).gte('date', since),
    supabase.from('food_intakes').select('date').eq('profileId', profileId).gte('date', since),
    supabase.from('tasklog_tasks').select('completedAt').eq('profileId', profileId).not('completedAt', 'is', null).gte('completedAt', since),
    supabase.from('finance_transactions').select('date').eq('profileId', profileId).gte('date', since),
    membership
      ? supabase
          .from('household_chore_instances')
          .select('completedAt')
          .eq('completedByProfileId', profileId)
          .not('completedAt', 'is', null)
          .gte('completedAt', since)
      : Promise.resolve({ data: [] }),
  ]);

  const dateSets: Record<string, Set<string>> = {
    burnlog: new Set([
      ...((burnRes.data as { date: string }[]) || []).map((r) => dayKey(r.date)),
      ...((foodRes.data as { date: string }[]) || []).map((r) => dayKey(r.date)),
    ]),
    tasklog: new Set(((taskRes.data as { completedAt: string }[]) || []).map((r) => dayKey(r.completedAt))),
    moneylog: new Set(((txRes.data as { date: string }[]) || []).map((r) => dayKey(r.date))),
    homelog: new Set(((choreRes.data as { completedAt: string }[]) || []).map((r) => dayKey(r.completedAt))),
  };

  const activeApps = Object.entries(dateSets)
    .filter(([, set]) => set.size > 0)
    .map(([app]) => app);

  if (activeApps.length === 0) {
    return { streak: 0, streakApps: [] };
  }

  let streak = 0;
  let cursor = new Date();
  let isFirstDay = true;

  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const key = dayKey(cursor);
    const allLogged = activeApps.every((app) => dateSets[app].has(key));

    if (allLogged) {
      streak++;
    } else if (isFirstDay) {
      // Today not complete yet — grace period, keep checking backward without breaking.
    } else {
      break;
    }

    isFirstDay = false;
    cursor = subDays(cursor, 1);
  }

  return { streak, streakApps: activeApps };
}

function buildInsight(opts: {
  burnedToday: number;
  tasksCompleted: number;
  tasksTotal: number;
  spentToday: number;
  dailyBudget: number;
  streak: number;
}): string {
  const { burnedToday, tasksCompleted, tasksTotal, spentToday, dailyBudget, streak } = opts;

  if (dailyBudget > 0 && spentToday >= dailyBudget * 0.5 && tasksCompleted === 0 && tasksTotal > 0) {
    return "You've already spent half of today's budget, but no tasks are done yet — busy day ahead.";
  }
  if (burnedToday === 0 && tasksTotal > 0 && tasksCompleted > 0) {
    return 'Tasks are moving today, but no workout logged yet — a short session could round things out.';
  }
  if (streak >= 2) {
    return `${streak}-day streak across your logs — keep the run going.`;
  }
  if (tasksTotal === 0 && burnedToday === 0 && spentToday === 0) {
    return "Nothing logged yet today — a quick entry in any app gets your streak started.";
  }
  return 'Keep logging across your apps today to build toward a full streak.';
}

async function computeActivity(
  supabase: SupabaseClient,
  profileId: string
): Promise<LogbookActivityEvent[]> {
  const { start, end } = getTodayRange();
  const membership = await getMyHouseholdMembership(supabase, profileId);

  const [foodRes, burnRes, taskRes, txRes, choreRes] = await Promise.all([
    supabase
      .from('food_intakes')
      .select('date, mealType, foodName, calories')
      .eq('profileId', profileId)
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('calorie_burns')
      .select('date, activityType, duration, caloriesBurned')
      .eq('profileId', profileId)
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('tasklog_tasks')
      .select('completedAt, title')
      .eq('profileId', profileId)
      .not('completedAt', 'is', null)
      .gte('completedAt', start)
      .lt('completedAt', end),
    supabase
      .from('finance_transactions')
      .select('createdAt, type, amount, label')
      .eq('profileId', profileId)
      .gte('createdAt', start)
      .lt('createdAt', end),
    membership
      ? supabase
          .from('household_chore_instances')
          .select('completedAt, choreId, household_chores(title)')
          .eq('completedByProfileId', profileId)
          .not('completedAt', 'is', null)
          .gte('completedAt', start)
          .lt('completedAt', end)
      : Promise.resolve({ data: [] }),
  ]);

  const events: LogbookActivityEvent[] = [];

  for (const r of (foodRes.data as { date: string; mealType: string; foodName: string; calories: number }[]) || []) {
    events.push({ app: 'burnlog', time: r.date, label: `Logged ${r.calories} cal ${r.mealType.toLowerCase()} (${r.foodName})` });
  }
  for (const r of (burnRes.data as { date: string; activityType: string; duration: number; caloriesBurned: number }[]) || []) {
    events.push({ app: 'burnlog', time: r.date, label: `${r.duration}min ${r.activityType} — burned ${r.caloriesBurned} cal` });
  }
  for (const r of (taskRes.data as { completedAt: string; title: string }[]) || []) {
    events.push({ app: 'tasklog', time: r.completedAt, label: `Completed: ${r.title}` });
  }
  for (const r of (txRes.data as { createdAt: string; type: string; amount: number; label: string }[]) || []) {
    events.push({
      app: 'moneylog',
      time: r.createdAt,
      label: `${r.type === 'income' ? 'Earned' : 'Spent'} ₹${r.amount} on ${r.label}`,
    });
  }
  for (const r of (choreRes.data as { completedAt: string; household_chores: { title: string } | null }[]) || []) {
    events.push({ app: 'homelog', time: r.completedAt, label: `Completed chore: ${r.household_chores?.title ?? 'chore'}` });
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return events;
}

export async function getLogbookToday(supabase: SupabaseClient, profileId: string): Promise<LogbookToday> {
  const today = dayKey(new Date());

  const [burnlog, tasklog, moneylog, streakInfo, activity, yesterdayScore] = await Promise.all([
    computeBurnlogCard(supabase, profileId),
    computeTasklogCard(supabase, profileId, today),
    computeMoneylogCard(supabase, profileId),
    computeStreak(supabase, profileId),
    computeActivity(supabase, profileId),
    computeYesterdayScore(supabase, profileId),
  ]);

  const scoreComponents = [burnlog.card.pct, tasklog.card.pct, moneylog.card.pct].filter(
    (pct): pct is number => pct !== null
  );
  const dayScore = scoreComponents.length > 0
    ? Math.round(scoreComponents.reduce((s, p) => s + p, 0) / scoreComponents.length)
    : null;

  const insight = buildInsight({
    burnedToday: burnlog.burnedToday,
    tasksCompleted: tasklog.completed,
    tasksTotal: tasklog.total,
    spentToday: moneylog.spentToday,
    dailyBudget: moneylog.card.target,
    streak: streakInfo.streak,
  });

  return {
    dayScore,
    yesterdayScore,
    cards: [burnlog.card, tasklog.card, moneylog.card, lifelogCard()],
    streak: streakInfo.streak,
    streakApps: streakInfo.streakApps,
    insight,
    activity,
  };
}
