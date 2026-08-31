// lib/logbook/weekly.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays } from 'date-fns';

export interface WeeklyMetric {
  app: 'burnlog' | 'tasklog' | 'moneylog' | 'lifelog';
  label: string;
  unit: string;
  thisWeek: number;
  lastWeek: number;
  available: boolean;
}

export interface LogbookWeekly {
  metrics: WeeklyMetric[];
}

function isoRange(daysAgoStart: number, daysAgoEnd: number) {
  return {
    start: subDays(new Date(), daysAgoStart).toISOString(),
    end: subDays(new Date(), daysAgoEnd).toISOString(),
  };
}

function sumBurn(rows: { caloriesBurned: number }[] | null): number {
  return (rows || []).reduce((s, r) => s + (r.caloriesBurned || 0), 0);
}

function sumSpend(rows: { type: string; amount: number }[] | null): number {
  return (rows || []).filter((r) => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);
}

export async function getLogbookWeekly(supabase: SupabaseClient, profileId: string): Promise<LogbookWeekly> {
  const thisWeek = isoRange(7, 0);
  const lastWeek = isoRange(14, 7);

  const [burnThis, burnLast, taskThis, taskLast, txThis, txLast] = await Promise.all([
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', thisWeek.start).lt('date', thisWeek.end),
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', lastWeek.start).lt('date', lastWeek.end),
    supabase
      .from('tasklog_tasks')
      .select('id')
      .eq('profileId', profileId)
      .not('completedAt', 'is', null)
      .gte('completedAt', thisWeek.start)
      .lt('completedAt', thisWeek.end),
    supabase
      .from('tasklog_tasks')
      .select('id')
      .eq('profileId', profileId)
      .not('completedAt', 'is', null)
      .gte('completedAt', lastWeek.start)
      .lt('completedAt', lastWeek.end),
    supabase.from('finance_transactions').select('type, amount').eq('profileId', profileId).gte('date', thisWeek.start).lt('date', thisWeek.end),
    supabase.from('finance_transactions').select('type, amount').eq('profileId', profileId).gte('date', lastWeek.start).lt('date', lastWeek.end),
  ]);

  return {
    metrics: [
      {
        app: 'burnlog',
        label: 'Calories burned',
        unit: 'kcal',
        thisWeek: sumBurn(burnThis.data as { caloriesBurned: number }[]),
        lastWeek: sumBurn(burnLast.data as { caloriesBurned: number }[]),
        available: true,
      },
      {
        app: 'tasklog',
        label: 'Tasks completed',
        unit: 'tasks',
        thisWeek: (taskThis.data || []).length,
        lastWeek: (taskLast.data || []).length,
        available: true,
      },
      {
        app: 'moneylog',
        label: 'Spent',
        unit: '₹',
        thisWeek: sumSpend(txThis.data as { type: string; amount: number }[]),
        lastWeek: sumSpend(txLast.data as { type: string; amount: number }[]),
        available: true,
      },
      {
        app: 'lifelog',
        label: 'Sleep',
        unit: 'hrs',
        thisWeek: 0,
        lastWeek: 0,
        available: false,
      },
    ],
  };
}
