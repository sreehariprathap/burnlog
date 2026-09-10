// lib/myday/materializeSourceBlocks.ts
//
// Tops up myday_blocks for a profile/date with real rows for every
// un-scheduled source item that should occupy a slot: habits due that day,
// the planned workout (skipping Rest days), any logged workout session with
// no matching plan block, tasks due/planned for today, and HomeLog chores
// assigned to this profile due today. Idempotent: only inserts for
// (source, sourceId) pairs that don't already have a block for that date,
// and the myday_blocks_source_unique index (see the Task 1 migration)
// guards against a race inserting the same source item twice.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDay, format } from 'date-fns';
import { placeCandidates, type PlacementCandidate, type TimeInterval } from './placement';

const HABIT_DEFAULT = { start: '07:00', duration: 15, step: 15 };
const WORKOUT_DEFAULT = { start: '18:00', duration: 60, step: 60 };
const TASK_DEFAULT = { start: '09:00', duration: 30, step: 30 };
const CHORE_DEFAULT = { start: '19:00', duration: 20, step: 20 };
const LOGGED_SESSION_DURATION = 60;

interface ExistingBlockRow {
  startTime: string;
  endTime: string;
  source: string;
  sourceId: string | null;
}

export async function ensureMyDaySourceBlocksMaterialized(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<void> {
  const { data: existingBlocks } = await supabase
    .from('myday_blocks')
    .select('startTime, endTime, source, sourceId')
    .eq('profileId', profileId)
    .eq('date', date);

  const rows = (existingBlocks as ExistingBlockRow[]) || [];
  const existingIntervals: TimeInterval[] = rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
  const existingKeys = new Set(rows.filter((r) => r.sourceId).map((r) => `${r.source}:${r.sourceId}`));

  const dayOfWeek = getDay(new Date(`${date}T00:00:00`));
  const candidates: PlacementCandidate[] = [];

  // 1. Logged sessions (fixed — placed at their real time, highest priority)
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, date, sessionData')
    .eq('profileId', profileId)
    .gte('date', `${date}T00:00:00`)
    .lt('date', `${date}T23:59:59.999`);
  for (const session of (sessions as { id: string; date: string; sessionData: { bodyPart?: string } | null }[]) || []) {
    const key = `burnlog:${session.id}`;
    if (existingKeys.has(key)) continue;
    const time = format(new Date(session.date), 'HH:mm');
    candidates.push({
      key,
      source: 'burnlog',
      sourceId: session.id,
      title: session.sessionData?.bodyPart ? `${session.sessionData.bodyPart} (logged)` : 'Workout (logged)',
      fixedStartTime: time,
      desiredStartTime: time,
      durationMinutes: LOGGED_SESSION_DURATION,
      stepMinutes: LOGGED_SESSION_DURATION,
    });
  }

  // 2. Habits due today
  const { data: habits } = await supabase
    .from('habits')
    .select('id, title')
    .eq('profileId', profileId)
    .eq('isActive', true);
  const habitById = new Map(((habits as { id: string; title: string }[]) || []).map((h) => [h.id, h]));
  if (habitById.size > 0) {
    const { data: occurrences } = await supabase
      .from('habit_occurrences')
      .select('id, habitId')
      .eq('date', date)
      .in('habitId', Array.from(habitById.keys()));
    for (const occurrence of (occurrences as { id: string; habitId: string }[]) || []) {
      const key = `habit:${occurrence.id}`;
      if (existingKeys.has(key)) continue;
      const habit = habitById.get(occurrence.habitId);
      if (!habit) continue;
      candidates.push({
        key,
        source: 'habit',
        sourceId: occurrence.id,
        title: habit.title,
        desiredStartTime: HABIT_DEFAULT.start,
        durationMinutes: HABIT_DEFAULT.duration,
        stepMinutes: HABIT_DEFAULT.step,
      });
    }
  }

  // 3. Planned workout for this day-of-week (skip Rest)
  const { data: plans } = await supabase
    .from('workout_plans')
    .select('id, bodyPart, time')
    .eq('profileId', profileId)
    .eq('dayOfWeek', dayOfWeek);
  for (const plan of (plans as { id: string; bodyPart: string; time: string | null }[]) || []) {
    if (plan.bodyPart === 'Rest') continue;
    const key = `burnlog:${plan.id}`;
    if (existingKeys.has(key)) continue;
    candidates.push({
      key,
      source: 'burnlog',
      sourceId: plan.id,
      title: `${plan.bodyPart} day`,
      desiredStartTime: plan.time ?? WORKOUT_DEFAULT.start,
      durationMinutes: WORKOUT_DEFAULT.duration,
      stepMinutes: WORKOUT_DEFAULT.step,
    });
  }

  // 4. Tasks due today or planned for today, not completed
  const { data: tasks } = await supabase
    .from('tasklog_tasks')
    .select('id, title, completedAt')
    .eq('profileId', profileId)
    .or(`dueDate.eq.${date},plannedForToday.eq.true`)
    .order('position', { ascending: true });
  for (const task of (tasks as { id: string; title: string; completedAt: string | null }[]) || []) {
    if (task.completedAt) continue;
    const key = `tasklog:${task.id}`;
    if (existingKeys.has(key)) continue;
    candidates.push({
      key,
      source: 'tasklog',
      sourceId: task.id,
      title: task.title,
      desiredStartTime: TASK_DEFAULT.start,
      durationMinutes: TASK_DEFAULT.duration,
      stepMinutes: TASK_DEFAULT.step,
    });
  }

  // 5. HomeLog chores assigned to this profile, due today, not completed
  const { data: choreInstances } = await supabase
    .from('household_chore_instances')
    .select('id, choreId')
    .eq('assignedProfileId', profileId)
    .eq('dueDate', date)
    .is('completedAt', null);
  const instanceRows = (choreInstances as { id: string; choreId: string }[]) || [];
  if (instanceRows.length > 0) {
    const { data: choreDefs } = await supabase
      .from('household_chores')
      .select('id, title')
      .in('id', instanceRows.map((i) => i.choreId));
    const titleByChoreId = new Map(((choreDefs as { id: string; title: string }[]) || []).map((c) => [c.id, c.title]));
    for (const instance of instanceRows) {
      const key = `homelog:${instance.id}`;
      if (existingKeys.has(key)) continue;
      candidates.push({
        key,
        source: 'homelog',
        sourceId: instance.id,
        title: titleByChoreId.get(instance.choreId) ?? 'Chore',
        desiredStartTime: CHORE_DEFAULT.start,
        durationMinutes: CHORE_DEFAULT.duration,
        stepMinutes: CHORE_DEFAULT.step,
      });
    }
  }

  if (candidates.length === 0) return;

  const placed = placeCandidates(candidates, existingIntervals);

  const { error } = await supabase.from('myday_blocks').insert(
    placed.map((p) => ({
      profileId,
      date,
      title: p.title,
      notes: null,
      startTime: p.startTime,
      endTime: p.endTime,
      source: p.source,
      sourceId: p.sourceId,
      completed: false,
    }))
  );
  // 23505 = unique_violation — another concurrent read already materialized
  // one of these (guarded by myday_blocks_source_unique); safe to ignore.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}
