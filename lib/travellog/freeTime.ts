import { addDays, eachDayOfInterval, format } from 'date-fns';

export interface FreeWindow {
  startDate: string;
  endDate: string;
  dayCount: number;
}

interface BusyBlock {
  date: string;
}

interface BusyTask {
  dueDate: string | null;
  completedAt: string | null;
}

/**
 * Scans `horizonDays` days from `fromDate` for stretches with no MydayBlock
 * entry and no incomplete Task due that day. Consecutive free days group
 * into a window; single free days are discarded (not a trip).
 */
export function computeFreeWindows(
  blocks: BusyBlock[],
  tasks: BusyTask[],
  fromDate: Date,
  horizonDays: number = 60
): FreeWindow[] {
  const busyDates = new Set<string>();
  for (const b of blocks) busyDates.add(b.date);
  for (const t of tasks) {
    if (t.dueDate && !t.completedAt) busyDates.add(t.dueDate);
  }

  const days = eachDayOfInterval({ start: fromDate, end: addDays(fromDate, horizonDays - 1) });
  const windows: FreeWindow[] = [];
  let windowDays: Date[] = [];

  function flush() {
    if (windowDays.length >= 2) {
      windows.push({
        startDate: format(windowDays[0], 'yyyy-MM-dd'),
        endDate: format(windowDays[windowDays.length - 1], 'yyyy-MM-dd'),
        dayCount: windowDays.length,
      });
    }
    windowDays = [];
  }

  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    if (busyDates.has(key)) {
      flush();
    } else {
      windowDays.push(day);
    }
  }
  flush();

  return windows;
}
