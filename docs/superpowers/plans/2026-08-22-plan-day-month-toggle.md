# Plan Page: Rename + Day/Month Calendar Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Workout nav entry to "Plan", add a Day/Month toggle to the Session page, and render a Month calendar (streak header, per-day workout labels, done/missed/rest/upcoming status) reading off the existing `workout_plans`/`sessions` tables — with tap-to-view-date navigation into a date-aware Day view.

**Architecture:** Pure additive UI + read queries against existing tables — no schema changes. A `PlanViewToggle` (thin `SmoothTabs` wrapper) switches between the existing Day-view JSX and a new `PlanMonthCalendar`. The Session page gains a `selectedDate` state (derived `day` weekday for the existing plan-fetch logic), and a new `PlanDaySummary` component renders a read-only view for any non-today date the user taps into from the calendar.

**Tech Stack:** Next.js client components, `@supabase/auth-helpers-nextjs`, `motion/react` (via existing `SmoothTabs`), `lucide-react`, Tailwind CSS.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing via Chrome DevTools MCP (`http://127.0.0.1:3000`, test account `push-verify@example.com` / `PushVerify123!`).
- No schema changes in this plan — everything renders from the existing `workout_plans` and `sessions` tables.
- Route stays `/session` — only the nav label and `TopBar` title change to "Plan". Every existing component under `app/session/_components/` keeps working unchanged for the "today" flow.
- `Profile.currentStreak` is a consecutive-**day** count (see `lib/leveling.ts`), not weeks — any UI copy must say "day streak", not "week streak" (the reference screenshot's wording doesn't apply here).
- Month view must not implement goal-met stars — that's explicitly deferred to a later phase (no per-day "goal" concept exists yet).

---

### Task 1: Rename nav label and page title to "Plan"

**Files:**
- Modify: `components/BottomNav.tsx`
- Modify: `app/session/page.tsx`

**Interfaces:**
- Produces: no new interfaces — pure label rename, zero behavior change.

- [ ] **Step 1: Rename the BottomNav label**

In `components/BottomNav.tsx`, change:
```ts
  { href: '/session',   label: 'Workout', Icon: DumbbellIcon },
```
to:
```ts
  { href: '/session',   label: 'Plan', Icon: DumbbellIcon },
```

- [ ] **Step 2: Rename the TopBar title**

In `app/session/page.tsx`, change:
```tsx
      <TopBar title="Sessions"  actions={
```
to:
```tsx
      <TopBar title="Plan"  actions={
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/dashboard`, confirm the bottom nav's second tab now reads "Plan" instead of "Workout" and still navigates to `/session`. Visit `/session` directly and confirm the top bar now reads "Plan". Confirm nothing else on the page changed (DayNavigator, PlanCard, AddWorkoutModal, History button all still work exactly as before).

- [ ] **Step 4: Commit**

```bash
git add components/BottomNav.tsx app/session/page.tsx
git commit -m "feat: rename Workout nav/page to Plan"
```

---

### Task 2: Day/Month toggle shell (Month view stubbed)

**Files:**
- Create: `lib/date.ts`
- Create: `components/kokonutui/plan-view-toggle.tsx`
- Modify: `app/session/page.tsx`

**Interfaces:**
- Produces: `toLocalDateString(d: Date): string`, `isSameLocalDay(a: Date, b: Date): boolean`, `nearestPastOrTodayWeekday(weekday: number, from?: Date): Date` from `lib/date.ts`.
- Produces: `PlanViewToggle({ view, onChange }: { view: 'day' | 'month'; onChange: (view: 'day' | 'month') => void })` from `components/kokonutui/plan-view-toggle.tsx`.
- Consumes: `SmoothTabs`, `TabItem` from `@/components/kokonutui/smooth-tabs` (already exists from the Goals page work).

- [ ] **Step 1: Write `lib/date.ts`**

```ts
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
```

- [ ] **Step 2: Write `PlanViewToggle`**

```tsx
// components/kokonutui/plan-view-toggle.tsx
'use client';

import { CalendarDays, CalendarRange } from 'lucide-react';
import { SmoothTabs, type TabItem } from './smooth-tabs';

const PLAN_VIEW_TABS: TabItem[] = [
  { id: 'day', icon: CalendarDays, label: 'Day view', color: 'var(--chart-1)' },
  { id: 'month', icon: CalendarRange, label: 'Month view', color: 'var(--chart-2)' },
];

type PlanViewToggleProps = {
  view: 'day' | 'month';
  onChange: (view: 'day' | 'month') => void;
};

export function PlanViewToggle({ view, onChange }: PlanViewToggleProps) {
  const selectedIndex = view === 'day' ? 0 : 1;
  return (
    <SmoothTabs
      items={PLAN_VIEW_TABS}
      selectedIndex={selectedIndex}
      onSelect={(index) => onChange(index === 0 ? 'day' : 'month')}
    />
  );
}
```

- [ ] **Step 3: Wire the toggle and `selectedDate` state into `app/session/page.tsx`**

Add imports (after the existing `import { BarChart } from 'lucide-react';` line):
```tsx
import { PlanViewToggle } from '@/components/kokonutui/plan-view-toggle';
import { nearestPastOrTodayWeekday } from '@/lib/date';
```

Add state (after `const [loadingPlan, setLoadingPlan] = useState<boolean>(true);`):
```tsx
  const [view, setView] = useState<'day' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
```

Replace the `DayNavigator`'s `onChange` — change:
```tsx
        <DayNavigator value={day} onChange={setDay} />
```
to:
```tsx
        <DayNavigator
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
          }}
        />
```

Add the toggle bar and a Month-view placeholder branch. Replace:
```tsx
      <div className="flex w-full gap-2 items-center px-4 py-2">
        <DayNavigator
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
          }}
        />
      </div>

      <div className="p-4 space-y-4">
```
with:
```tsx
      <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <PlanViewToggle view={view} onChange={setView} />
      </div>

      {view === 'month' ? (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Month view coming soon.</p>
        </div>
      ) : (
        <>
      <div className="flex w-full gap-2 items-center px-4 py-2">
        <DayNavigator
          value={day}
          onChange={(newDay) => {
            setDay(newDay);
            setSelectedDate(nearestPastOrTodayWeekday(newDay));
          }}
        />
      </div>

      <div className="p-4 space-y-4">
```

And close the new conditional right after the existing Day-view content ends. Find:
```tsx
      </div>

      <AddWorkoutModal
        open={showAddModal}
        initialDay={day}
        onOpenChange={setShowAddModal}
        onSaved={handleSaved}
      />
      <BottomNav />
    </div>
  );
}
```
and replace with:
```tsx
      </div>
        </>
      )}

      <AddWorkoutModal
        open={showAddModal}
        initialDay={day}
        onOpenChange={setShowAddModal}
        onSaved={handleSaved}
      />
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/session`. Confirm a Day/Month pill toggle renders below the "Plan" title bar, defaulting to Day (existing behavior unchanged). Tap "Month" and confirm the placeholder text renders. Tap "Day" again and confirm the existing DayNavigator + PlanCard flow still works exactly as before, including tapping a different weekday in DayNavigator (no visible behavior change yet from the `selectedDate` plumbing — it's inert until Task 4).

- [ ] **Step 5: Commit**

```bash
git add lib/date.ts components/kokonutui/plan-view-toggle.tsx app/session/page.tsx
git commit -m "feat: add Day/Month view toggle shell to the Plan page"
```

---

### Task 3: `PlanMonthCalendar` — real calendar rendering

**Files:**
- Create: `app/session/_components/PlanMonthCalendar.tsx`
- Modify: `app/session/page.tsx`

**Interfaces:**
- Produces: `PlanMonthCalendar({ profileId, currentStreak, selectedDate, onSelectDate }: PlanMonthCalendarProps)` where `PlanMonthCalendarProps = { profileId: string; currentStreak: number; selectedDate: Date; onSelectDate: (date: Date) => void }`.
- Consumes: `toLocalDateString`, `isSameLocalDay` from `@/lib/date` (Task 2).

- [ ] **Step 1: Write `PlanMonthCalendar`**

```tsx
// app/session/_components/PlanMonthCalendar.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Flame, Moon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalDateString, isSameLocalDay } from '@/lib/date';

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
// Display order Mon..Sun -> canonical dayOfWeek (0=Sun..6=Sat), matching DayNavigator.
const DISPLAY_TO_CANONICAL = [1, 2, 3, 4, 5, 6, 0];

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
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
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
```

DISPLAY_TO_CANONICAL and WEEKDAY_HEADERS are declared for documentation/future use of the Monday-first convention shared with `DayNavigator`, but note `buildMonthGrid`'s day-of-week math (`(first.getDay() + 6) % 7`) already directly encodes Monday-first without needing the lookup array — **remove the unused `DISPLAY_TO_CANONICAL` constant** before committing (it would otherwise be flagged as an unused variable by `tsc`/lint).

- [ ] **Step 2: Wire it into `app/session/page.tsx`, fetch `currentStreak`**

Add to the profile fetch (currently `select('id, lifestyle')`), change to:
```tsx
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, lifestyle, currentStreak')
          .eq('userId', user.id)
          .single();
```

Add state (near the other `useState` calls):
```tsx
  const [currentStreak, setCurrentStreak] = useState<number>(0);
```

Set it alongside the existing profile-derived state (inside the same `if (profileData)` block that sets `profileId`/`lifestyle`):
```tsx
        if (profileData) {
          setProfileId(profileData.id);
          setCurrentStreak(profileData.currentStreak ?? 0);
          if (profileData.lifestyle) {
            setLifestyle(profileData.lifestyle as LifestyleAnswers);
          }
        }
```

Add the import:
```tsx
import { PlanMonthCalendar } from './_components/PlanMonthCalendar';
```

Replace the Month-view placeholder from Task 2:
```tsx
      {view === 'month' ? (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Month view coming soon.</p>
        </div>
      ) : (
```
with:
```tsx
      {view === 'month' ? (
        profileId && (
          <PlanMonthCalendar
            profileId={profileId}
            currentStreak={currentStreak}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setDay(date.getDay());
              setView('day');
            }}
          />
        )
      ) : (
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors (including no unused-variable error for `DISPLAY_TO_CANONICAL` — confirm it was removed per Step 1's note).

Before checking in the browser, seed some test data so the calendar has something to show (use `mcp__supabase__execute_sql` against the test account's profile, matching the pattern used for the dashboard Consistency Tracker's verification):
1. Look up the test profile id: `select id from profiles where "userId" = '9ec675ff-a1c0-480c-a95b-7dbb25ccd9bd';`
2. Ensure at least one `workout_plans` row exists with a non-Rest `bodyPart` for a weekday that has already passed this month but has no matching completed `sessions` row — this should render as `missed`.
3. Confirm at least one weekday has a completed `sessions` row (the test account already has session history from earlier verification in this project) — should render as `done`.

Visit `http://127.0.0.1:3000/session`, switch to Month view. Confirm: header shows "{N} day streak" and "{N} rest day(s)"; the grid shows Mon–Sun columns; days with a non-Rest scheduled workout show a short label; a past day with a completed session shows a filled circle; a past day with a scheduled-but-not-completed workout shows a muted circle with an X; today's cell has a ring highlight if it matches `selectedDate`. Tap a past "missed" day — confirm the view switches to Day and (for now, until Task 4) the existing Day view renders using the tapped day's weekday (Task 4 makes this show the correct read-only summary instead of the live "Start Session" flow). Tap the month's prev/next arrows and confirm the grid and rest-day count update for the new month. Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add app/session/_components/PlanMonthCalendar.tsx app/session/page.tsx
git commit -m "feat: render Month calendar view on the Plan page"
```

---

### Task 4: Date-aware Day view (`PlanDaySummary` for non-today dates)

**Files:**
- Create: `app/session/_components/PlanDaySummary.tsx`
- Modify: `app/session/page.tsx`

**Interfaces:**
- Produces: `PlanDaySummary({ date, scheduledBodyPart, session }: PlanDaySummaryProps)` where `PlanDaySummaryProps = { date: Date; scheduledBodyPart: string | null; session: { completed: boolean; duration?: number; notes?: string } | null }`.

- [ ] **Step 1: Write `PlanDaySummary`**

```tsx
// app/session/_components/PlanDaySummary.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PlanDaySummaryProps = {
  date: Date;
  /** The recurring weekday's scheduled body part, or null/'Rest' for a rest day. */
  scheduledBodyPart: string | null;
  /** The actual logged session for this exact date, if any. Only meaningful for past dates. */
  session: { completed: boolean; duration?: number; notes?: string } | null;
};

export function PlanDaySummary({ date, scheduledBodyPart, session }: PlanDaySummaryProps) {
  const label = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const isRestDay = !scheduledBodyPart || scheduledBodyPart === 'Rest';
  const isFuture = date.getTime() > Date.now();

  let title: string;
  let description: string;
  let tone: 'done' | 'missed' | 'rest' | 'upcoming';

  if (isRestDay) {
    title = 'Rest Day';
    description = 'Nothing was scheduled.';
    tone = 'rest';
  } else if (session?.completed) {
    title = `${scheduledBodyPart} — Completed`;
    description = session.notes || 'Logged and completed.';
    tone = 'done';
  } else if (isFuture) {
    title = `${scheduledBodyPart} Day`;
    description = 'Scheduled — come back on the day to log it.';
    tone = 'upcoming';
  } else {
    title = `${scheduledBodyPart} Day — Missed`;
    description = 'No workout was logged for this day.';
    tone = 'missed';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            'font-medium',
            tone === 'done' && 'text-primary',
            tone === 'missed' && 'text-destructive',
            tone === 'rest' && 'text-muted-foreground',
            tone === 'upcoming' && 'text-muted-foreground'
          )}
        >
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {session?.duration && <p className="text-sm">Duration: {session.duration} minutes</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Fetch the selected date's session and branch the Day view in `app/session/page.tsx`**

Add the import:
```tsx
import { PlanDaySummary } from './_components/PlanDaySummary';
import { isSameLocalDay, toLocalDateString } from '@/lib/date';
```
(This replaces the Task 2 import of `nearestPastOrTodayWeekday` alone — the import line should now read `import { nearestPastOrTodayWeekday, isSameLocalDay, toLocalDateString } from '@/lib/date';`.)

Add state (near the other `useState` calls):
```tsx
  const [dateSession, setDateSession] = useState<{ completed: boolean; duration?: number; notes?: string } | null>(null);
```

Add a fetch effect (after the existing `fetchPlan` `useEffect`):
```tsx
  useEffect(() => {
    const today = new Date();
    if (isSameLocalDay(selectedDate, today) || !profileId) {
      setDateSession(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('sessions')
        .select('sessionData')
        .eq('profileId', profileId)
        .eq('date', toLocalDateString(selectedDate))
        .maybeSingle();

      if (!cancelled) {
        setDateSession(data ? (data.sessionData as { completed: boolean; duration?: number; notes?: string }) : null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, selectedDate]);
```

Replace the Day-view content block. Find:
```tsx
      <div className="p-4 space-y-4">
        {loadingPlan ? (
          // Skeleton placeholder while loading
          <Card className='p-3'>
            <Skeleton className="h-[25px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        ) : (
          <>
            <PlanCard
              plan={plan}
              onStart={() => setLogging(true)}
              onAdd={() => setShowAddModal(true)}
            />
            
            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}
          </>
        )}
      </div>
```
with:
```tsx
      <div className="p-4 space-y-4">
        {loadingPlan ? (
          // Skeleton placeholder while loading
          <Card className='p-3'>
            <Skeleton className="h-[25px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        ) : isSameLocalDay(selectedDate, new Date()) ? (
          <>
            <PlanCard
              plan={plan}
              onStart={() => setLogging(true)}
              onAdd={() => setShowAddModal(true)}
            />
            
            {/* Show workout checklist when a plan exists but not yet started */}
            {plan && (
              <div className="mt-6">
                <WorkoutChecklist workoutType={plan.bodyPart} />
              </div>
            )}
          </>
        ) : (
          <PlanDaySummary
            date={selectedDate}
            scheduledBodyPart={plan?.bodyPart ?? null}
            session={dateSession}
          />
        )}
      </div>
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Visit `http://127.0.0.1:3000/session`, switch to Month view, tap the same "missed" day used in Task 3's verification. Confirm the view switches to Day and now shows the `PlanDaySummary` card with "{BodyPart} Day — Missed" (not the live PlanCard/Start Session flow). Tap a day with a completed session — confirm it shows "{BodyPart} — Completed". Tap a Rest day — confirm "Rest Day". Tap today in the calendar (or use DayNavigator to return to today's weekday) — confirm the live `PlanCard` + "Start Session" flow still renders exactly as before, unchanged. Confirm `DayNavigator` still lets you preview other weekdays' recurring templates (jumping to the nearest past/today occurrence of that weekday, per `nearestPastOrTodayWeekday`) without breaking the day/month toggle. Check both light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add app/session/_components/PlanDaySummary.tsx app/session/page.tsx
git commit -m "feat: show read-only day summary for non-today dates on the Plan page"
```
