// app/session/_components/PlanMonthCalendar.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Flame, Moon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalDateString, isSameLocalDay } from '@/lib/date';
import { PlanMonthActivitySummary } from './PlanMonthActivitySummary';

type PlanMonthCalendarProps = {
  profileId: string;
  currentStreak: number;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
};

type DayCellStatus = 'rest' | 'done' | 'missed' | 'upcoming';

type DayCell = {
  date: Date;
  inDisplayedMonth: boolean;
  status: DayCellStatus;
  label: string | null;
};

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** Monday-first grid: every date from the Monday on/before the 1st to the Sunday on/after the last day of the month. */
function buildMonthGrid(displayMonth: Date): Date[] {
  const first = startOfMonth(displayMonth);
  const last = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0);

  const startOffset = (first.getDay() + 6) % 7; // days since most recent Monday
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);

  const endOffset = (7 - ((last.getDay() + 6) % 7) - 1) % 7; // days until next Sunday
  const gridEnd = new Date(last);
  gridEnd.setDate(gridEnd.getDate() + endOffset);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function PlanMonthCalendar({ profileId, currentStreak, selectedDate, onSelectDate }: PlanMonthCalendarProps) {
  const supabase = createClientComponentClient();
  const [displayMonth, setDisplayMonth] = useState<Date>(startOfMonth(new Date()));
  const [workoutPlans, setWorkoutPlans] = useState<{ dayOfWeek: number; bodyPart: string }[]>([]);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchMonthData() {
      setLoading(true);

      const { data: plans } = await supabase
        .from('workout_plans')
        .select('dayOfWeek, bodyPart')
        .eq('profileId', profileId);

      const monthStart = startOfMonth(displayMonth);
      const monthEnd = addMonths(displayMonth, 1);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('date, sessionData')
        .eq('profileId', profileId)
        .gte('date', monthStart.toISOString())
        .lt('date', monthEnd.toISOString());

      if (cancelled) return;

      setWorkoutPlans(plans ?? []);

      const done = new Set<string>();
      for (const row of sessions ?? []) {
        const sessionData = row.sessionData as { completed?: boolean } | null;
        if (sessionData?.completed) {
          done.add(String(row.date).split('T')[0]);
        }
      }
      setCompletedDates(done);
      setLoading(false);
    }

    fetchMonthData();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, displayMonth]);

  const today = new Date();
  const gridDays = buildMonthGrid(displayMonth);

  const cells: DayCell[] = gridDays.map((date) => {
    const weekday = date.getDay();
    const plan = workoutPlans.find((p) => p.dayOfWeek === weekday);
    const isRest = !plan || plan.bodyPart === 'Rest';
    const dateStr = toLocalDateString(date);
    const isDone = completedDates.has(dateStr);
    const isFuture = date > today && !isSameLocalDay(date, today);
    const inDisplayedMonth = date.getMonth() === displayMonth.getMonth();

    let status: DayCellStatus;
    let label: string | null = null;

    if (isRest) {
      status = 'rest';
    } else {
      label = plan!.bodyPart;
      if (isDone) {
        status = 'done';
      } else if (isFuture || isSameLocalDay(date, today)) {
        status = 'upcoming';
      } else {
        status = 'missed';
      }
    }

    return { date, inDisplayedMonth, status, label };
  });

  const restDaysThisMonth = cells.filter((c) => c.inDisplayedMonth && c.status === 'rest').length;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <Flame className="size-4" />
          {currentStreak} day streak
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Moon className="size-4" />
          {restDaysThisMonth} rest day{restDaysThisMonth === 1 ? '' : 's'}
        </div>
      </div>

      <PlanMonthActivitySummary profileId={profileId} displayMonth={displayMonth} />

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setDisplayMonth((m) => addMonths(m, -1))} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="font-medium">
          {displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setDisplayMonth((m) => addMonths(m, 1))} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_HEADERS.map((h) => (
              <CardTitle key={h} className="text-center text-xs font-normal text-muted-foreground">
                {h}
              </CardTitle>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() => onSelectDate(cell.date)}
                  disabled={!cell.inDisplayedMonth}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs',
                    !cell.inDisplayedMonth && 'opacity-30',
                    isSameLocalDay(cell.date, selectedDate) && 'ring-2 ring-primary'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full',
                      cell.status === 'done' && 'bg-primary text-primary-foreground',
                      cell.status === 'missed' && 'bg-muted text-muted-foreground',
                      cell.status === 'rest' && 'text-muted-foreground/60',
                      cell.status === 'upcoming' && 'border border-dashed border-muted-foreground/40 text-muted-foreground'
                    )}
                  >
                    {cell.status === 'missed' ? <X className="size-3.5" /> : cell.date.getDate()}
                  </span>
                  {cell.label && cell.status !== 'missed' && (
                    <span className="max-w-full truncate text-[10px] text-muted-foreground">{cell.label}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
