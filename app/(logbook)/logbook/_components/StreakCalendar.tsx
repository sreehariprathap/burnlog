'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LogbookCalendar, LogbookCalendarDay } from '@/lib/logbook/calendar';

async function fetchCalendar(): Promise<LogbookCalendar> {
  const res = await fetch('/api/logbook/calendar');
  if (!res.ok) throw new Error('Failed to load streak calendar');
  return res.json();
}

const LEVEL_CLASSES: Record<0 | 1 | 2, string> = {
  0: 'bg-muted',
  1: 'bg-green-300 dark:bg-green-800',
  2: 'bg-green-500 dark:bg-green-500',
};

export function StreakCalendar() {
  const { data, isLoading, error } = useSWR('logbook-calendar', fetchCalendar);

  const weeks = useMemo(() => {
    if (!data || data.days.length === 0) return [];
    const firstDow = new Date(`${data.days[0].date}T00:00:00`).getDay();
    const padded: (LogbookCalendarDay | null)[] = [...Array(firstDow).fill(null), ...data.days];
    const cols: (LogbookCalendarDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }
    return cols;
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="mb-3 h-4 w-32" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  if (data.activeApps.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <CalendarDays className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No streak yet</p>
          <p className="text-xs text-muted-foreground">
            Log something in any app to start building your streak calendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Streak calendar</h2>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Less</span>
            {([0, 1, 2] as const).map((level) => (
              <span key={level} className={`h-2.5 w-2.5 rounded-sm ${LEVEL_CLASSES[level]}`} />
            ))}
            <span>More</span>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={
                    day
                      ? `${day.date} — ${day.apps.length ? day.apps.join(', ') : 'nothing logged'}`
                      : undefined
                  }
                  className={`h-2.5 w-2.5 rounded-sm ${day ? LEVEL_CLASSES[day.level] : 'bg-transparent'}`}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Full green = every app you use was logged that day.
        </p>
      </CardContent>
    </Card>
  );
}
