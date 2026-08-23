// lib/financePeriods.ts
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  isWithinInterval,
  format,
} from 'date-fns';

export type Period = 'weekly' | 'monthly' | 'yearly';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function getPeriodRange(period: Period, anchor: Date = new Date()): PeriodRange {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case 'monthly':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'yearly':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}

/** Human-readable label for the current period's date range, e.g. "Aug 17 – Aug 23" or "August 2026". */
export function formatPeriodLabel(period: Period, range: PeriodRange): string {
  switch (period) {
    case 'weekly': {
      const sameMonth = range.start.getMonth() === range.end.getMonth();
      const startStr = format(range.start, sameMonth ? 'MMM d' : 'MMM d, yyyy');
      const endStr = format(range.end, 'MMM d, yyyy');
      return `${startStr} – ${endStr}`;
    }
    case 'monthly':
      return format(range.start, 'MMMM yyyy');
    case 'yearly':
      return format(range.start, 'yyyy');
  }
}

export interface RecurringItemRow {
  id: string;
  type: string;
  category: string;
  label: string;
  amount: number;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface FinanceLineItem {
  type: string;
  category: string;
  amount: number;
  date: Date;
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  return Math.min(day, lastDay);
}

export function expandRecurringInRange(
  items: RecurringItemRow[],
  start: Date,
  end: Date
): FinanceLineItem[] {
  const results: FinanceLineItem[] = [];

  for (const item of items) {
    if (!item.isActive) continue;
    const itemStart = new Date(item.startDate);
    const itemEnd = item.endDate ? new Date(item.endDate) : null;
    if (itemStart > end) continue;
    if (itemEnd && itemEnd < start) continue;

    if (item.frequency === 'weekly' && item.dayOfWeek !== null) {
      for (const day of eachDayOfInterval({ start, end })) {
        if (day.getDay() !== item.dayOfWeek) continue;
        if (day < itemStart) continue;
        if (itemEnd && day > itemEnd) continue;
        results.push({ type: item.type, category: item.category, amount: item.amount, date: day });
      }
    } else if (item.frequency === 'monthly' && item.dayOfMonth !== null) {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor <= end) {
        const day = clampDayOfMonth(cursor.getFullYear(), cursor.getMonth(), item.dayOfMonth);
        const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), day);
        if (
          isWithinInterval(occurrence, { start, end }) &&
          occurrence >= itemStart &&
          (!itemEnd || occurrence <= itemEnd)
        ) {
          results.push({ type: item.type, category: item.category, amount: item.amount, date: occurrence });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (item.frequency === 'yearly' && item.dayOfMonth !== null && item.monthOfYear !== null) {
      for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const monthIndex = item.monthOfYear - 1;
        const day = clampDayOfMonth(year, monthIndex, item.dayOfMonth);
        const occurrence = new Date(year, monthIndex, day);
        if (
          isWithinInterval(occurrence, { start, end }) &&
          occurrence >= itemStart &&
          (!itemEnd || occurrence <= itemEnd)
        ) {
          results.push({ type: item.type, category: item.category, amount: item.amount, date: occurrence });
        }
      }
    }
  }

  return results;
}
