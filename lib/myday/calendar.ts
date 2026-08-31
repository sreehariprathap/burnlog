// lib/myday/calendar.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { format as formatDate } from 'date-fns';
import type { MyDayCalendarMonth } from './types';

export async function getMyDayCalendarMonth(
  supabase: SupabaseClient,
  profileId: string,
  month: string
): Promise<MyDayCalendarMonth> {
  const [year, monthNum] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = formatDate(new Date(year, monthNum, 0), 'yyyy-MM-dd'); // last day of month

  const { data } = await supabase
    .from('myday_blocks')
    .select('date')
    .eq('profileId', profileId)
    .gte('date', start)
    .lte('date', end);

  const daysWithBlocks = Array.from(new Set(((data as { date: string }[]) || []).map((r) => r.date)));
  return { month, daysWithBlocks };
}
