// lib/moneylog/period.ts
//
// Configurable period boundaries for MoneyLog's "this year"/"this month"/
// "this week" calculations (MoneyLog > Config > Calculation periods).
// Defaults match plain calendar behavior — Jan 1 for the year, the 1st for
// the month, Monday for the week — so existing behavior is unchanged until
// a user opts into something else.
import { addDays, addMonths, addYears, setDate, setMonth, startOfWeek, endOfWeek } from 'date-fns';

export type WeekStart = 'monday' | 'saturday' | 'sunday';

export interface PeriodConfig {
  /** 1 (January) through 12 (December) — first month of the "year". */
  yearStartMonth: number;
  /** 1-28 — day of month the "month" begins on. */
  monthStartDay: number;
  weekStart: WeekStart;
}

export const DEFAULT_PERIOD_CONFIG: PeriodConfig = {
  yearStartMonth: 1,
  monthStartDay: 1,
  weekStart: 'monday',
};

const WEEK_START_DAY_INDEX: Record<WeekStart, 0 | 1 | 6> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

function isWeekStart(value: unknown): value is WeekStart {
  return value === 'monday' || value === 'saturday' || value === 'sunday';
}

/** Reads the three MoneyLog period settings off a profile-shaped row,
 * falling back to calendar defaults for anything missing or invalid. */
export function getPeriodConfig(profile: Record<string, unknown> | null | undefined): PeriodConfig {
  const yearStartMonth = typeof profile?.moneylogYearStartMonth === 'number' && profile.moneylogYearStartMonth >= 1 && profile.moneylogYearStartMonth <= 12
    ? profile.moneylogYearStartMonth
    : DEFAULT_PERIOD_CONFIG.yearStartMonth;
  const monthStartDay = typeof profile?.moneylogMonthStartDay === 'number' && profile.moneylogMonthStartDay >= 1 && profile.moneylogMonthStartDay <= 28
    ? profile.moneylogMonthStartDay
    : DEFAULT_PERIOD_CONFIG.monthStartDay;
  const weekStart = isWeekStart(profile?.moneylogWeekStart) ? profile.moneylogWeekStart : DEFAULT_PERIOD_CONFIG.weekStart;
  return { yearStartMonth, monthStartDay, weekStart };
}

/** The "week" containing `date`, per config.weekStart. */
export function getWeekRange(date: Date, config: PeriodConfig = DEFAULT_PERIOD_CONFIG): { start: Date; end: Date } {
  const weekStartsOn = WEEK_START_DAY_INDEX[config.weekStart];
  return {
    start: startOfWeek(date, { weekStartsOn }),
    end: endOfWeek(date, { weekStartsOn }),
  };
}

/** The "month" containing `date`, per config.monthStartDay. When
 * monthStartDay is 1, this is exactly the plain calendar month. */
export function getMonthRange(date: Date, config: PeriodConfig = DEFAULT_PERIOD_CONFIG): { start: Date; end: Date } {
  let start = setDate(date, config.monthStartDay);
  if (date.getDate() < config.monthStartDay) {
    start = addMonths(start, -1);
  }
  const end = addDays(addMonths(start, 1), -1);
  return { start, end };
}

/** The "year" containing `date`, per config.yearStartMonth (always starting
 * on the 1st of that month). When yearStartMonth is 1, this is exactly the
 * plain calendar year. */
export function getYearRange(date: Date, config: PeriodConfig = DEFAULT_PERIOD_CONFIG): { start: Date; end: Date } {
  let start = setMonth(setDate(date, 1), config.yearStartMonth - 1);
  if (date < start) {
    start = addYears(start, -1);
  }
  const end = addDays(addYears(start, 1), -1);
  return { start, end };
}
