// lib/homelog/choreRecurrence.ts

export interface ChoreRecurrenceFields {
  frequency: string; // 'once' | 'weekly' | 'monthly' | 'yearly'
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/** Next occurrence strictly after `after`. Returns null for 'once' (no next occurrence). */
export function nextOccurrenceAfter(chore: ChoreRecurrenceFields, after: Date): Date | null {
  if (chore.frequency === 'once') return null;

  if (chore.frequency === 'weekly' && chore.dayOfWeek !== null) {
    const candidate = new Date(after);
    do {
      candidate.setDate(candidate.getDate() + 1);
    } while (candidate.getDay() !== chore.dayOfWeek);
    return candidate;
  }

  if (chore.frequency === 'monthly' && chore.dayOfMonth !== null) {
    const sameMonthDay = clampDayOfMonth(after.getFullYear(), after.getMonth(), chore.dayOfMonth);
    const sameMonthCandidate = new Date(after.getFullYear(), after.getMonth(), sameMonthDay);
    if (sameMonthCandidate > after) return sameMonthCandidate;

    const nextMonthIndex = after.getMonth() + 1;
    const nextMonthDay = clampDayOfMonth(after.getFullYear(), nextMonthIndex, chore.dayOfMonth);
    return new Date(after.getFullYear(), nextMonthIndex, nextMonthDay);
  }

  if (chore.frequency === 'yearly' && chore.dayOfMonth !== null && chore.monthOfYear !== null) {
    const monthIndex = chore.monthOfYear - 1;
    const sameYearDay = clampDayOfMonth(after.getFullYear(), monthIndex, chore.dayOfMonth);
    const sameYearCandidate = new Date(after.getFullYear(), monthIndex, sameYearDay);
    if (sameYearCandidate > after) return sameYearCandidate;

    const nextYear = after.getFullYear() + 1;
    const nextYearDay = clampDayOfMonth(nextYear, monthIndex, chore.dayOfMonth);
    return new Date(nextYear, monthIndex, nextYearDay);
  }

  return null;
}
