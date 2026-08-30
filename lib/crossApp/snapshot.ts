// lib/crossApp/snapshot.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodRange, expandRecurringInRange, type RecurringItemRow } from '@/lib/financePeriods';
import { todayDateString } from '@/lib/tasklog/types';

export interface CrossAppSnapshot {
  burnlogStreak: number | null; // null = no BurnLog usage signal at all
  moneylogWeeklyNet: number | null; // null = no MoneyLog usage signal at all
  tasklogStreak: number | null; // null = no TaskLog usage signal at all
  tasklogDueToday: number; // always a number — "0 due today" is meaningful
  homelogChoresDueToday: number; // always a number — "0 due today" (or no household) is meaningful
  sociallogUnreadCount: number | null; // null = never sent/received a message
  shoppinglogCartCount: number | null; // null = never added a cart item or placed an order
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

async function resolveMoneylogWeeklyNet(supabase: SupabaseClient, profileId: string): Promise<number | null> {
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

  const hasAnyMoneylogActivity = recurringItems.length > 0 || (everTransactedRes.count ?? 0) > 0;
  if (!hasAnyMoneylogActivity) return null;

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

async function resolveHomelogChoresDueToday(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { data: membership } = await supabase
    .from('household_members')
    .select('householdId')
    .eq('profileId', profileId)
    .maybeSingle();
  if (!membership) return 0;

  const today = todayDateString();
  const { data: chores } = await supabase
    .from('household_chores')
    .select('id')
    .eq('householdId', membership.householdId);
  const choreIds = (chores ?? []).map((c) => c.id);
  if (choreIds.length === 0) return 0;

  const { count } = await supabase
    .from('household_chore_instances')
    .select('id', { count: 'exact', head: true })
    .in('choreId', choreIds)
    .eq('dueDate', today)
    .is('completedAt', null);
  return count ?? 0;
}

async function resolveSociallogUnreadCount(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { data: threads } = await supabase
    .from('social_message_threads')
    .select('id')
    .or(`participantAId.eq.${profileId},participantBId.eq.${profileId}`);
  const threadIds = (threads ?? []).map((t) => t.id);
  if (threadIds.length === 0) return null;

  const { count } = await supabase
    .from('social_messages')
    .select('id', { count: 'exact', head: true })
    .in('threadId', threadIds)
    .neq('senderId', profileId)
    .is('readAt', null);
  return count ?? 0;
}

async function resolveShoppinglogCartCount(supabase: SupabaseClient, profileId: string): Promise<number | null> {
  const { count: cartCount } = await supabase
    .from('shop_cart_items')
    .select('id', { count: 'exact', head: true })
    .eq('profileId', profileId);
  if (cartCount && cartCount > 0) return cartCount;

  const { count: everOrdered } = await supabase
    .from('shop_orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyerId', profileId);
  return everOrdered && everOrdered > 0 ? 0 : null;
}

export async function getCrossAppSnapshot(supabase: SupabaseClient, profileId: string): Promise<CrossAppSnapshot> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('currentStreak, taskLogCurrentStreak')
    .eq('id', profileId)
    .single();

  const [
    burnlogStreak,
    tasklogStreak,
    moneylogWeeklyNet,
    tasklogDueToday,
    homelogChoresDueToday,
    sociallogUnreadCount,
    shoppinglogCartCount,
  ] = await Promise.all([
    resolveBurnlogStreak(supabase, profileId, profileRow?.currentStreak ?? 0).catch(() => null),
    resolveTasklogStreak(supabase, profileId, profileRow?.taskLogCurrentStreak ?? 0).catch(() => null),
    resolveMoneylogWeeklyNet(supabase, profileId).catch(() => null),
    resolveTasklogDueToday(supabase, profileId).catch(() => 0),
    resolveHomelogChoresDueToday(supabase, profileId).catch(() => 0),
    resolveSociallogUnreadCount(supabase, profileId).catch(() => null),
    resolveShoppinglogCartCount(supabase, profileId).catch(() => null),
  ]);

  return {
    burnlogStreak,
    moneylogWeeklyNet,
    tasklogStreak,
    tasklogDueToday,
    homelogChoresDueToday,
    sociallogUnreadCount,
    shoppinglogCartCount,
  };
}
