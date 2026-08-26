// lib/crossApp/snapshot.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodRange, expandRecurringInRange, type RecurringItemRow } from '@/lib/financePeriods';
import { todayDateString } from '@/lib/tasklog/types';

export interface CrossAppSnapshot {
  burnlogStreak: number | null; // null = no BurnLog usage signal at all
  lifelogWeeklyNet: number | null; // null = no LifeLog usage signal at all
  tasklogStreak: number | null; // null = no TaskLog usage signal at all
  tasklogDueToday: number; // always a number — "0 due today" is meaningful
}

async function resolveBurnlogStreak(supabase: SupabaseClient, profileId: string, currentStreak: number): Promise<number | null> {
  if (currentStreak > 0) return currentStreak;
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('profileId', profileId);
  return count && count > 0 ? 0 : null;
}

async function resolveTasklogStreak(supabase: SupabaseClient, profileId: string, taskLogCurrentStreak: number): Promise<number | null> {
  if (taskLogCurrentStreak > 0) return taskLogCurrentStreak;
  const { count } = await supabase
    .from('tasklog_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('profileId', profileId);
  return count && count > 0 ? 0 : null;
}

async function resolveLifelogWeeklyNet(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { start, end } = getPeriodRange('weekly');

  const [recurringRes, transactionsRes, everTransactedRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase
      .from('finance_transactions')
      .select('type, category, amount, date')
      .eq('profileId', profileId)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString()),
    supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('profileId', profileId),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const transactions =
    (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || [];

  const hasAnyLifelogActivity = recurringItems.length > 0 || (everTransactedRes.count ?? 0) > 0;
  if (!hasAnyLifelogActivity) return null;

  const virtualItems = expandRecurringInRange(recurringItems, start, end);
  const allItems = [
    ...virtualItems,
    ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
  ];

  return allItems.reduce((net, item) => net + (item.type === 'income' ? item.amount : -item.amount), 0);
}

async function resolveTasklogDueToday(supabase: SupabaseClient, profileId: string): Promise<number> {
  const today = todayDateString();
  const { count } = await supabase
    .from('tasklog_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('profileId', profileId)
    .is('completedAt', null)
    .or(`dueDate.eq.${today},plannedForToday.eq.true`);
  return count ?? 0;
}

export async function getCrossAppSnapshot(supabase: SupabaseClient, profileId: string): Promise<CrossAppSnapshot> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('currentStreak, taskLogCurrentStreak')
    .eq('id', profileId)
    .single();

  const [burnlogStreak, tasklogStreak, lifelogWeeklyNet, tasklogDueToday] = await Promise.all([
    resolveBurnlogStreak(supabase, profileId, profileRow?.currentStreak ?? 0).catch(() => null),
    resolveTasklogStreak(supabase, profileId, profileRow?.taskLogCurrentStreak ?? 0).catch(() => null),
    resolveLifelogWeeklyNet(supabase, profileId).catch(() => null),
    resolveTasklogDueToday(supabase, profileId).catch(() => 0),
  ]);

  return { burnlogStreak, lifelogWeeklyNet, tasklogStreak, tasklogDueToday };
}
