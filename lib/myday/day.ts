// lib/myday/day.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDay, getDate as getDateOfMonth } from 'date-fns';
import type { RecurringItemRow } from '@/lib/financePeriods';
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from './types';

interface MyDayBlockRow {
  id: string;
  title: string;
  notes: string | null;
  startTime: string;
  endTime: string;
  source: string;
  sourceId: string | null;
  completed: boolean;
}

async function computeActual(
  supabase: SupabaseClient,
  profileId: string,
  source: string,
  sourceId: string | null,
  date: string
): Promise<boolean | null> {
  if (!sourceId) return null;

  if (source === 'tasklog') {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('completedAt')
      .eq('id', sourceId)
      .eq('profileId', profileId)
      .maybeSingle();
    return data ? Boolean(data.completedAt) : null;
  }

  if (source === 'burnlog') {
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('profileId', profileId)
      .gte('date', `${date}T00:00:00`)
      .lt('date', `${date}T23:59:59.999`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  return null;
}

export async function getMyDayForDate(supabase: SupabaseClient, profileId: string, date: string): Promise<MyDayData> {
  const { data: blockRows } = await supabase
    .from('myday_blocks')
    .select('id, title, notes, startTime, endTime, source, sourceId, completed')
    .eq('profileId', profileId)
    .eq('date', date)
    .order('startTime', { ascending: true });

  const rows = (blockRows as MyDayBlockRow[]) || [];
  const blocks: MyDayBlock[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      startTime: row.startTime,
      endTime: row.endTime,
      source: row.source as MyDayBlock['source'],
      sourceId: row.sourceId,
      completed: row.completed,
      actual: await computeActual(supabase, profileId, row.source, row.sourceId, date),
    }))
  );

  const scheduledSourceIds = new Set(rows.filter((r) => r.sourceId).map((r) => r.sourceId as string));

  const target = new Date(`${date}T00:00:00`);
  const dayOfWeek = getDay(target);
  const dayOfMonth = getDateOfMonth(target);

  const unscheduled: MyDayUnscheduledItem[] = [];

  const [workoutPlanRes, taskRes, recurringRes] = await Promise.all([
    supabase.from('workout_plans').select('id, bodyPart').eq('profileId', profileId).eq('dayOfWeek', dayOfWeek),
    supabase
      .from('tasklog_tasks')
      .select('id, title, completedAt')
      .eq('profileId', profileId)
      .or(`dueDate.eq.${date},plannedForToday.eq.true`),
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true).eq('type', 'expense'),
  ]);

  for (const plan of (workoutPlanRes.data as { id: string; bodyPart: string }[]) || []) {
    if (scheduledSourceIds.has(plan.id)) continue;
    unscheduled.push({
      key: `burnlog:${plan.id}`,
      title: `${plan.bodyPart} day`,
      source: 'burnlog',
      sourceId: plan.id,
      label: 'Planned workout',
    });
  }

  for (const task of (taskRes.data as { id: string; title: string; completedAt: string | null }[]) || []) {
    if (task.completedAt) continue;
    if (scheduledSourceIds.has(task.id)) continue;
    unscheduled.push({
      key: `tasklog:${task.id}`,
      title: task.title,
      source: 'tasklog',
      sourceId: task.id,
      label: 'Task due today',
    });
  }

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  for (const item of recurringItems) {
    const isDueToday =
      (item.frequency === 'monthly' && item.dayOfMonth === dayOfMonth) ||
      (item.frequency === 'weekly' && item.dayOfWeek === dayOfWeek) ||
      (item.frequency === 'yearly' && item.dayOfMonth === dayOfMonth);
    if (!isDueToday) continue;
    if (scheduledSourceIds.has(item.id)) continue;
    unscheduled.push({
      key: `moneylog:${item.id}`,
      title: item.label,
      source: 'moneylog',
      sourceId: item.id,
      label: 'Bill due',
    });
  }

  return { date, blocks, unscheduled };
}
