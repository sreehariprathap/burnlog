import type { SupabaseClient } from '@supabase/supabase-js';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { expandRecurringInRange, type RecurringItemRow, type FinanceLineItem } from '@/lib/financePeriods';

/**
 * Average monthly (income - expense) over the last 3 calendar months,
 * reusing the same recurring-item expansion MoneyLog's own period views use.
 * There is no stored running balance in this codebase — this average is
 * the honest "disposable surplus" signal available.
 */
export async function computeAverageMonthlySurplus(
  supabase: SupabaseClient,
  profileId: string
): Promise<number> {
  const now = new Date();
  const start = startOfMonth(subMonths(now, 2));
  const end = endOfMonth(now);

  const [recurringRes, transactionsRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase
      .from('finance_transactions')
      .select('*')
      .eq('profileId', profileId)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString()),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const transactions =
    (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || [];

  const virtualItems = expandRecurringInRange(recurringItems, start, end);
  const allItems: FinanceLineItem[] = [
    ...virtualItems,
    ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
  ];

  let net = 0;
  for (const item of allItems) {
    if (item.type === 'income') net += item.amount;
    else if (item.type === 'expense') net -= item.amount;
  }

  return net / 3;
}
