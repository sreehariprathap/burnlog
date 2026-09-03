// lib/moneylog/intel.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Summarizes a profile's MoneyLog spending for the IntelLog snapshot pipeline.
 * budgetPct = month-to-date expense total / sum of the profile's spending_cap
 * targets, as a percentage. Omitted entirely when the profile has no
 * spending_cap goals — there's nothing to benchmark against.
 */
export async function extractMoneylogSnapshot(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<Record<string, number>> {
  const { data: goals, error: goalsError } = await supabase
    .from('financial_goals')
    .select('category, targetValue')
    .eq('profileId', profileId)
    .eq('goalType', 'spending_cap');
  if (goalsError) throw goalsError;
  if (!goals || goals.length === 0) return {};

  const monthStart = new Date(date);
  monthStart.setDate(1);

  const { data: transactions, error: txError } = await supabase
    .from('finance_transactions')
    .select('category, amount')
    .eq('profileId', profileId)
    .eq('type', 'expense')
    .gte('date', monthStart.toISOString());
  if (txError) throw txError;

  const cappedCategories = new Set(goals.map((g: { category: string }) => g.category));
  const totalTarget = goals.reduce((sum: number, g: { targetValue: number }) => sum + g.targetValue, 0);
  const totalSpend = (transactions ?? [])
    .filter((t: { category: string }) => cappedCategories.has(t.category))
    .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

  return { budgetPct: totalTarget > 0 ? Math.round((totalSpend / totalTarget) * 100) : 0 };
}
