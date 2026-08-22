// lib/consistency.ts

/** Bonus xp awarded once per calendar week when all 7 days have logged activity. */
export const WEEKLY_CONSISTENCY_BONUS_XP = 50;

export type DayStatus = 'done' | 'missed' | 'today' | 'upcoming';

export type ConsistencyDay = {
  /** Local YYYY-MM-DD date string. */
  date: string;
  /** Sun, Mon, Tue, ... */
  dayLabel: string;
  status: DayStatus;
};

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns the Sunday-Saturday week containing `now`, as local start/end
 * Date boundaries (end is exclusive) plus the 7 local YYYY-MM-DD dates
 * in the week, Sunday first.
 */
export function getWeekRange(now: Date = new Date()): { start: Date; end: Date; dates: string[] } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startOfToday);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toLocalDateString(d));
  }

  return { start, end, dates };
}

/** Stable id for a week, used to dedupe the once-per-week consistency bonus. Just the week's Sunday date. */
export function getWeekId(now: Date = new Date()): string {
  return getWeekRange(now).dates[0];
}

/**
 * Builds the 7-day consistency view for the current week.
 * `activeDates` is the set of local YYYY-MM-DD dates that have at least
 * one logged activity (session, calorie burn, food intake, steps, stamina,
 * or weight entry).
 */
export function computeConsistencyWeek(
  activeDates: Set<string>,
  now: Date = new Date()
): { days: ConsistencyDay[]; activeCount: number; isFullWeek: boolean } {
  const { dates } = getWeekRange(now);
  const today = toLocalDateString(now);

  const days: ConsistencyDay[] = dates.map((date, index) => {
    const isActive = activeDates.has(date);
    let status: DayStatus;
    if (date === today) {
      status = isActive ? 'done' : 'today';
    } else if (date < today) {
      status = isActive ? 'done' : 'missed';
    } else {
      status = 'upcoming';
    }
    return { date, dayLabel: DAY_LABELS[index], status };
  });

  const activeCount = days.filter((d) => d.status === 'done').length;

  return { days, activeCount, isFullWeek: activeCount === 7 };
}
