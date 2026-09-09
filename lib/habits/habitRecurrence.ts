// lib/habits/habitRecurrence.ts
//
// Pure date math for habit recurrence: given a habit's recurrence fields
// and a date range, computes which 'yyyy-MM-dd' dates the habit is due on.
// No I/O — see lib/habits/materialize.ts for the Supabase-backed wrapper
// that uses these to top up HabitOccurrence rows.

import { addDays, format, isAfter, isBefore, parseISO } from 'date-fns';

export type HabitRecurrenceType = 'once' | 'daily' | 'weekly';
export type HabitEndType = 'never' | 'on_date' | 'after_n';

export interface HabitRecurrenceFields {
  recurrenceType: HabitRecurrenceType;
  daysOfWeek: number[];
  intervalWeeks: number;
  endType: HabitEndType;
  endDate: string | null;
  endCount: number | null;
  startDate: string;
}

// Safety cap on the day-by-day scan below, so a pathological input (e.g. a
// daily habit with no end condition queried against a huge range) can't
// spin forever. ~10 years of daily iteration is far beyond any real range
// this module is ever called with (materialize.ts caps ranges to ~60 days).
const MAX_ITERATIONS = 3660;

function toDate(iso: string): Date {
  return parseISO(iso);
}

function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDueOnWeekly(habit: HabitRecurrenceFields, start: Date, cursor: Date): boolean {
  if (!habit.daysOfWeek.includes(cursor.getDay())) return false;
  if (habit.intervalWeeks <= 1) return true;
  const weeksSinceStart = Math.round(
    (startOfWeek(cursor).getTime() - startOfWeek(start).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weeksSinceStart % habit.intervalWeeks === 0;
}

export function computeOccurrenceDates(habit: HabitRecurrenceFields, rangeStart: string, rangeEnd: string): string[] {
  const start = toDate(habit.startDate);
  const rangeStartDate = toDate(rangeStart);
  const rangeEndDate = toDate(rangeEnd);
  const hardEndDate = habit.endType === 'on_date' && habit.endDate ? toDate(habit.endDate) : null;

  if (habit.recurrenceType === 'once') {
    if (isBefore(start, rangeStartDate) || isAfter(start, rangeEndDate)) return [];
    if (hardEndDate && isAfter(start, hardEndDate)) return [];
    return [toISO(start)];
  }

  const results: string[] = [];
  let occurrenceCount = 0;
  let cursor = start;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (isAfter(cursor, rangeEndDate)) break;
    if (hardEndDate && isAfter(cursor, hardEndDate)) break;

    const isDue = habit.recurrenceType === 'daily' || isDueOnWeekly(habit, start, cursor);

    if (isDue) {
      occurrenceCount += 1;
      if (habit.endType === 'after_n' && habit.endCount !== null && occurrenceCount > habit.endCount) {
        break;
      }
      if (!isBefore(cursor, rangeStartDate)) {
        results.push(toISO(cursor));
      }
    }

    cursor = addDays(cursor, 1);
  }

  return results;
}

export function computeMissingOccurrences(
  habit: HabitRecurrenceFields,
  existingDates: string[],
  rangeStart: string,
  rangeEnd: string
): string[] {
  const existing = new Set(existingDates);
  return computeOccurrenceDates(habit, rangeStart, rangeEnd).filter((date) => !existing.has(date));
}
