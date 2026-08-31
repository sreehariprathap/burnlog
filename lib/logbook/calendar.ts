// lib/logbook/calendar.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays, format as formatDate } from 'date-fns';
import { getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export interface LogbookCalendarDay {
  date: string; // yyyy-MM-dd
  apps: string[]; // which active apps logged something this day
  level: 0 | 1 | 2; // 0 = nothing, 1 = some apps, 2 = every active app
}

export interface LogbookCalendar {
  days: LogbookCalendarDay[];
  activeApps: string[];
}

const CALENDAR_DAYS = 91; // ~13 weeks, GitHub-style

function dayKey(d: Date | string): string {
  return formatDate(new Date(d), 'yyyy-MM-dd');
}

export async function getLogbookCalendar(supabase: SupabaseClient, profileId: string): Promise<LogbookCalendar> {
  const since = subDays(new Date(), CALENDAR_DAYS - 1).toISOString();
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

  const days: LogbookCalendarDay[] = [];
  for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
    const key = dayKey(subDays(new Date(), i));
    const apps = activeApps.filter((app) => dateSets[app].has(key));
    const level: 0 | 1 | 2 =
      activeApps.length === 0 || apps.length === 0 ? 0 : apps.length === activeApps.length ? 2 : 1;
    days.push({ date: key, apps, level });
  }

  return { days, activeApps };
}
