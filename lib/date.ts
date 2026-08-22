// lib/date.ts

export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateString(a) === toLocalDateString(b);
}

/**
 * The most recent date (today or earlier, within the last 6 days) that
 * falls on `weekday` (0=Sun..6=Sat). Used when switching the Day view's
 * weekday picker: if the target weekday is today, stay on today; otherwise
 * jump to the most recent past occurrence rather than a future one, so the
 * Day view keeps showing real (loggable or historical) days by default.
 */
export function nearestPastOrTodayWeekday(weekday: number, from: Date = new Date()): Date {
  const result = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (result.getDay() - weekday + 7) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}
