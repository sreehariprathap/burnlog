// lib/moneylog/queries.ts
//
// Single source of truth for MoneyLog's preloadable page queries — same
// pattern as lib/burnlog/queries.ts. `recurringItemsQuery` in particular
// replaces THREE independent, uncached fetches of the same
// recurring_items|isActive=true data (plan/page.tsx, FinancialGoalsList.tsx,
// and lib/useFinanceData.ts, though the last stays out of scope — see the
// plan's "Explicitly NOT modified" note) with one shared cache entry.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import type { AssetSummary } from '@/app/(moneylog)/moneylog/assets/_components/AssetListItem';

export type FinancialGoal = {
  id: string;
  goalType: string;
  label: string;
  category: string | null;
  targetValue: number;
  targetDate: string | null;
  createdAt: string;
};

export async function fetchFinancialGoals(supabase: SupabaseClient, profileId: string): Promise<FinancialGoal[]> {
  const { data, error } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('profileId', profileId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data as FinancialGoal[]) ?? [];
}

export function financialGoalsQuery(profileId: string) {
  return {
    key: ['moneylog-financial-goals', profileId] as const,
    fetcher: () => fetchFinancialGoals(createClient(), profileId),
  };
}

export type RecurringItem = {
  id: string;
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
};

export async function fetchRecurringItems(supabase: SupabaseClient, profileId: string): Promise<RecurringItem[]> {
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .eq('profileId', profileId)
    .eq('isActive', true)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data as RecurringItem[]) ?? [];
}

export function recurringItemsQuery(profileId: string) {
  return {
    key: ['moneylog-recurring-items', profileId] as const,
    fetcher: () => fetchRecurringItems(createClient(), profileId),
  };
}

export type FinanceTransactionLine = { type: string; category: string; amount: number; date: string };

export async function fetchAllFinanceTransactions(
  supabase: SupabaseClient,
  profileId: string
): Promise<FinanceTransactionLine[]> {
  const { data, error } = await supabase.from('finance_transactions').select('*').eq('profileId', profileId);
  if (error) throw error;
  return (data as FinanceTransactionLine[]) ?? [];
}

export function allFinanceTransactionsQuery(profileId: string) {
  return {
    key: ['moneylog-all-finance-transactions', profileId] as const,
    fetcher: () => fetchAllFinanceTransactions(createClient(), profileId),
  };
}

export type AssetsSummary = { assets: AssetSummary[]; netWorth: number };

export async function fetchAssetsSummary(): Promise<AssetsSummary> {
  const res = await apiFetch('/api/moneylog/assets');
  if (!res.ok) throw new Error('Failed to load assets');
  return res.json();
}

export function assetsQuery() {
  return {
    key: '/api/moneylog/assets',
    fetcher: fetchAssetsSummary,
  };
}
