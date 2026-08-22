# Plan Page: Rename + Day/Month Calendar Toggle — Design

> Phase 0 + Phase 1 of `docs/superpowers/specs/2026-08-22-plan-page-roadmap.md`.
> Read that roadmap first for full context on why this phase is scoped
> the way it is and what's deliberately deferred to later phases.

## Problem

The Workout page (`/session`) only ever shows "what's the recurring
plan for this weekday" — there's no way to see the month at a glance,
no visual streak/rest-day summary, and no way to look back at a
specific past date's actual logged activity. The user wants a
calendar-style Month view (referencing a screenshot: streak header,
per-day workout labels, rest-day/missed-day distinction) alongside the
existing Day view, under a renamed "Plan" nav label — with zero loss
of existing workout-plan/session data.

## Decisions (confirmed with user)

- Nav label changes from "Workout" to **"Plan"**. The route stays
  `/session` — this is a label/branding change only, not a URL/data
  migration, to avoid touching every internal link for no functional
  benefit.
- Day/Month switch is a **SmoothTabs-style pill toggle** (the same
  icon-pill pattern built for the Goals page, two items instead of
  six), not a dropdown — keeps the app visually consistent.
- Tapping a day in the Month calendar **switches to Day view showing
  that date** (not read-only).

## Scope boundary (from the roadmap — repeated here so this spec is self-contained)

**In scope:** Day/Month toggle shell, Month calendar rendering off the
*existing* data model (`WorkoutPlan`'s single repeating
weekday template + `sessions` history), streak header, day-tap
navigation, past-day read-only history view.

**Out of scope (later phases):** per-week-varying schedules (Phase 3),
meal guidance / "extra for today" / water tracker in Day view (Phases
3 & 5), goal-met stars on calendar days (Phase 2 — no per-day "goal"
concept exists yet to evaluate).

## Architecture

### 1. Nav rename

`components/BottomNav.tsx`: change `{ href: '/session', label: 'Workout', Icon: DumbbellIcon }`
to `{ href: '/session', label: 'Plan', Icon: DumbbellIcon }`. `TopBar`
title on `app/session/page.tsx` changes from whatever it currently
renders to `"Plan"`. No route, component, or data changes — every
existing `/session` internal link, `WorkoutPlan`/`sessions` table, and
component under `app/session/_components/` is untouched by this step.

### 2. Date-awareness added to the Session page

Today, `app/session/page.tsx` tracks only `day: number` (a weekday
0–6, `new Date().getDay()` initially) — the whole page is "what's
scheduled for this weekday," with no concept of a specific calendar
date. To support tapping a specific day in the Month calendar and
seeing that day's actual history, the page needs a `selectedDate: Date`
state (defaulting to today) in addition to the existing `day` weekday
state:

```ts
const [selectedDate, setSelectedDate] = useState<Date>(new Date());
const day = selectedDate.getDay(); // derived, replaces the old standalone `day` state
```

`DayNavigator` (the Mon–Sun weekday picker already at the top of the
Day view) continues to work exactly as before for switching *which
weekday's recurring plan* to preview, but now also updates
`selectedDate` to the nearest occurrence of that weekday (today if it
matches, otherwise the most recent past occurrence — see "Day view
behavior" below for why past vs. future matters here).

### 3. `PlanViewToggle` component (new)

`components/kokonutui/plan-view-toggle.tsx` — a thin wrapper around
the existing `SmoothTabs` component with exactly two items:

```tsx
const planViewTabs: TabItem[] = [
  { id: 'day', icon: CalendarDays, label: 'Day', color: 'var(--chart-1)' },
  { id: 'month', icon: CalendarRange, label: 'Month', color: 'var(--chart-2)' },
];
```

Rendered at the top of `app/session/page.tsx` (below `TopBar`, same
sticky treatment as the Goals page's tab bar), driving a
`view: 'day' | 'month'` state that conditionally renders the existing
Day-view JSX or the new `PlanMonthCalendar`.

### 4. `PlanMonthCalendar` component (new)

`app/session/_components/PlanMonthCalendar.tsx` — client component,
props: `profileId: string`, `currentStreak: number`,
`onSelectDate: (date: Date) => void` (calls back to the page to switch
to Day view on that date, per the confirmed tap behavior).

**Data fetched:**
- `workout_plans` for the profile (all 7 rows at most, cheap, matches
  what `app/session/page.tsx` already fetches per-weekday — this
  component fetches all weekdays at once instead of one at a time).
- `sessions` for the profile, filtered to the displayed month's date
  range (`gte`/`lt` on `date`), `select('date, sessionData')`.

**Rendering:** a 7-column grid (Mon–Sun, matching `DayNavigator`'s
existing `DISPLAY_ORDER = [1,2,3,4,5,6,0]` display convention so the
two views agree on week layout), one row per calendar week, populated
from the currently-displayed month (state `displayMonth: Date`,
defaulting to the current month; a prev/next month header control lets
the user page backward/forward — no infinite scroll, keeps this phase
simple).

**Per-day cell status** (computed by cross-referencing that date's
weekday against `workout_plans`, and that exact date against
`sessions`):

| Condition | Status | Visual |
|---|---|---|
| `workout_plans` row for that weekday has `bodyPart === 'Rest'` or no row exists | `rest` | muted, no label |
| Date has a `sessions` row with `sessionData.completed === true` | `done` | filled colored circle + short label (e.g. "Full Body") |
| Date is in the past, a non-Rest workout was scheduled for that weekday, but no completed session exists for that date | `missed` | outlined circle with a small "skip" marker (✕ or similar — reusing the same visual language as the dashboard Consistency Tracker's missed-day marker for consistency) |
| Date is today or in the future, a non-Rest workout is scheduled | `upcoming` | faint/dashed label preview, no status marker yet |

**Header row:** `🔥 {currentStreak} day streak` — `Profile.currentStreak`
is a consecutive-*day* count (per `lib/leveling.ts`'s `computeStreakUpdate`),
not weeks, so this uses the same "day streak" wording already shown by
the dashboard Consistency Tracker, not the reference screenshot's "week
streak" phrasing verbatim. Paired with a count of `rest` days in the
displayed month, mirroring the reference screenshot's two-stat header
layout (streak stat + rest-day stat side by side).

### 5. Day view behavior for non-today dates

Since `sessions` are logged against exact dates but `workout_plans` is
weekday-recurring, tapping a past date in the Month calendar needs to
show what *actually happened* that day, not just the recurring
template:

- **Today:** unchanged — full existing live flow (`PlanCard` →
  "Start Session" → `SessionLogger` → `CompletionTracker`).
- **Past date:** read-only summary card — if a `sessions` row exists
  for that exact date, show its `sessionData` (body part, duration,
  notes — reuse whatever `WorkoutHistory` already renders per entry,
  don't build a second renderer); if the weekday had a non-Rest
  workout scheduled but nothing was logged, show a "Missed — no
  workout logged" state; if the weekday's plan is Rest, show a
  "Rest day" state. No "Start Session" button on past dates — logging
  is only ever for today, avoiding backdating complexity.
- **Future date (this week or beyond):** read-only preview of the
  recurring weekday's scheduled body part, no logging action (can't
  log a workout that hasn't happened yet).

This means `PlanCard`'s "Start Session" button must be conditionally
hidden/disabled when `selectedDate` is not today — a small prop
addition (`isToday: boolean`) rather than a rewrite.

## Data flow

No new tables, no schema changes. Everything renders from existing
`workout_plans` and `sessions` tables, fetched with wider date-range
queries than today's single-weekday fetch. `Profile.currentStreak` is
already fetched elsewhere in the app (dashboard) — this page will need
its own fetch of the profile row (or receive it via a shared layout —
TBD at implementation-plan time, whichever matches how `app/session/page.tsx`
currently gets `profileId`).

## Error handling

Same posture as the rest of the app: no new error states beyond what
existing Supabase fetch-failure handling in `app/session/page.tsx`
already does. Empty month (no `workout_plans` at all, e.g. a user who
never set up a schedule) renders every day as `rest` — matches today's
"No Workout Scheduled" empty state already shown by `PlanCard`.

## Testing

No automated test framework in this repo (project-wide constraint).
Manual verification: `npx tsc --noEmit`, then in-browser (Chrome
DevTools MCP) — toggle Day/Month, confirm calendar shows correct
done/missed/rest/upcoming status against seeded `workout_plans` +
`sessions` test data, tap a past missed day and confirm the read-only
"Missed" state renders, tap today and confirm the live flow still
works unchanged, check both light and dark mode.

## Open questions

None — all decisions confirmed with the user. (Exact icon choices for
`PlanViewToggle`, and the precise streak-unit wording in the header,
are implementation-plan-level details, not open design questions.)
