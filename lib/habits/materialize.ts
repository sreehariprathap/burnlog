// lib/habits/materialize.ts
//
// Tops up HabitOccurrence rows for a profile's active habits so the window
// [today, throughDate + WINDOW_DAYS] is fully covered. Idempotent: safe to
// call on every habit creation and on every My Day read — it only inserts
// dates a habit doesn't already have a row for, so re-running never
// duplicates (also enforced by the @@unique([habitId, date]) constraint).

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { computeMissingOccurrences, type HabitRecurrenceFields } from './habitRecurrence';

const WINDOW_DAYS = 60;

interface HabitRow extends HabitRecurrenceFields {
  id: string;
}

export async function ensureHabitOccurrences(
  supabase: SupabaseClient,
  profileId: string,
  throughDate: string
): Promise<void> {
  const rangeStart = format(new Date(), 'yyyy-MM-dd');
  const rangeEnd = format(addDays(new Date(`${throughDate}T00:00:00`), WINDOW_DAYS), 'yyyy-MM-dd');

  const { data: habits } = await supabase
    .from('habits')
    .select('id, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate')
    .eq('profileId', profileId)
    .eq('isActive', true);

  for (const habit of (habits as HabitRow[]) || []) {
    const { data: existing } = await supabase
      .from('habit_occurrences')
      .select('date')
      .eq('habitId', habit.id)
      .gte('date', rangeStart)
      .lte('date', rangeEnd);

    const existingDates = ((existing as { date: string }[]) || []).map((row) => row.date);
    const missing = computeMissingOccurrences(habit, existingDates, rangeStart, rangeEnd);
    if (missing.length === 0) continue;

    await supabase.from('habit_occurrences').insert(missing.map((date) => ({ habitId: habit.id, date })));
  }
}
