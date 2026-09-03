// lib/logbook/queries.ts
//
// Single source of truth for LogBook's preloadable page queries — same
// pattern as the eight prior registries. `todayQuery` in particular
// replaces a fetchLogbookToday() function that was copy-pasted verbatim
// into both page.tsx (Home) and morning/page.tsx before this file
// existed — same key in both (so no double-fetch bug), but the same
// query logic duplicated across two files instead of shared. Once both
// consume this entry, /logbook/morning is preloaded "for free" whenever
// Home's query is warmed, with no separate registry entry needed for it.
import { format } from 'date-fns';
import type { LogbookToday } from '@/lib/logbook/today';
import type { MyDayData } from '@/lib/myday/types';

export async function fetchToday(): Promise<LogbookToday> {
  const res = await fetch('/api/logbook/today');
  if (!res.ok) throw new Error('Failed to load logbook data');
  return res.json();
}

export function todayQuery() {
  return {
    key: 'logbook-today',
    fetcher: fetchToday,
  };
}

/** 'yyyy-MM-dd' for the current date — the default MyDay opens to when no `?date=` is in the URL. */
export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export async function fetchMyDay(date: string): Promise<MyDayData> {
  const res = await fetch(`/api/myday?date=${date}`);
  if (!res.ok) throw new Error('Failed to load MyDay');
  return res.json();
}

export function myDayQuery(date: string) {
  return {
    key: `myday-${date}`,
    fetcher: () => fetchMyDay(date),
  };
}
