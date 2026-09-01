// lib/useFinanceData.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPeriodRange, expandRecurringInRange } from '@/lib/financePeriods';
import type { Period, RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';

export interface FinanceData {
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  totalIncome: number;
  totalExpense: number;
  loading: boolean;
}

const EMPTY_DATA: FinanceData = {
  incomeByCategory: {},
  expenseByCategory: {},
  totalIncome: 0,
  totalExpense: 0,
  loading: true,
};

export function useFinanceData(profileId: string | null, period: Period, refreshKey: number = 0): FinanceData {
  const supabase = createClient();
  const [data, setData] = useState<FinanceData>(EMPTY_DATA);

  const fetchData = useCallback(async () => {
    if (!profileId) {
      setData({ ...EMPTY_DATA, loading: false });
      return;
    }
    setData((prev) => ({ ...prev, loading: true }));
    try {
      const { start, end } = getPeriodRange(period);

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

      const incomeByCategory: Record<string, number> = {};
      const expenseByCategory: Record<string, number> = {};
      let totalIncome = 0;
      let totalExpense = 0;

      for (const item of allItems) {
        if (item.type === 'income') {
          incomeByCategory[item.category] = (incomeByCategory[item.category] || 0) + item.amount;
          totalIncome += item.amount;
        } else if (item.type === 'expense') {
          expenseByCategory[item.category] = (expenseByCategory[item.category] || 0) + item.amount;
          totalExpense += item.amount;
        }
      }

      setData({ incomeByCategory, expenseByCategory, totalIncome, totalExpense, loading: false });
    } catch (error) {
      console.error('Error fetching finance data:', error);
      setData({ ...EMPTY_DATA, loading: false });
    }
    // refreshKey isn't read above — it's a caller-controlled cache-buster whose
    // only job is to change identity so callers can force a refetch on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, period, supabase, refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return data;
}
