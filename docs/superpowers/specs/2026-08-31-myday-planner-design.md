# MyDay planner — design

## Problem

Logbook's dock currently has two tabs: Logbook (home) and Profile. There's no
way to plan a whole day — wake-up to sleep, with everything in between — or
to look back/forward at how a day was planned versus what actually happened
across the other apps.

## Goal

Add a "MyDay" tab to the Logbook dock: a per-day, Teams-calendar-style
timeline that combines manually-added time blocks with cross-app items
(planned workout, meal plan, tasks due today, bills due) that aren't
scheduled to a specific time yet. A calendar trigger lets the user jump to
any day and see it.

## Route & dock

- New page: `app/(logbook)/logbook/myday/page.tsx`.
- Date is a `?date=YYYY-MM-DD` search param, defaulting to today.
- `components/LogbookBottomNav.tsx` gets a third tab, "MyDay" (lucide
  `CalendarClock`), between Logbook and Profile.

## Data model

New table `myday_blocks` (RLS scoped to `profileId`, same convention as
every other table in this schema):

| column      | type      | notes                                              |
|-------------|-----------|-----------------------------------------------------|
| id          | uuid      | pk                                                   |
| profileId   | uuid      | fk to profiles                                       |
| date        | date      | the day this block belongs to                        |
| title       | text      |                                                       |
| notes       | text      | nullable                                             |
| startTime   | text      | `HH:mm`, same convention as `scheduled_reminders.timeOfDay` |
| endTime     | text      | `HH:mm`                                              |
| source      | text      | `'manual' \| 'burnlog' \| 'tasklog' \| 'moneylog'`   |
| sourceId    | uuid      | nullable; links back to the originating row (e.g. `tasklog_tasks.id`) for actual-status lookup |
| completed   | boolean   | default false; user-toggleable for manual blocks     |
| createdAt   | timestamp |                                                       |

Cross-app items that don't have an exact time — planned workout
(`workout_plans` by `dayOfWeek`), meal-plan meals (`meal_plan_entries` by
`dayOfWeek`/`mealType`), tasks due today (`tasklog_tasks`, same
`.or(dueDate.eq.today,plannedForToday.eq.true)` query as
`lib/logbook/today.ts`), and bills due today (`recurring_items` expanded via
`expandRecurringInRange` for a single-day range) — are **not** stored. They're
computed on read as "unscheduled" items for the given date. Scheduling one
(via the add-block sheet) creates a `myday_blocks` row with `source`/
`sourceId` set.

"Actual" status is computed live, not cached: for `source: 'tasklog'`,
`tasklog_tasks.completedAt`; for `source: 'burnlog'` (workout), whether a
`sessions` row exists for that date. Bills/meals show as reminders without a
plan-vs-actual comparison (no reliable "paid"/"eaten" signal exists in the
schema today).

## API

Following the existing `app/api/logbook/*` pattern (`createRouteHandlerClient`
→ `getMyProfileId` → service-role query):

- `GET /api/myday?date=YYYY-MM-DD` → `{ blocks: MyDayBlock[], unscheduled: UnscheduledItem[] }`
- `POST /api/myday` → create a manual or scheduled-from-unscheduled block
- `PATCH /api/myday/[id]` → edit fields / toggle `completed`
- `DELETE /api/myday/[id]`
- `GET /api/myday/calendar?month=YYYY-MM` → `{ days: [{ date, hasBlocks }] }`, used for the month-grid dots (dots reflect `myday_blocks` only, not cross-app data — keeps the query cheap)

New `lib/myday/day.ts` (aggregation, mirrors `lib/logbook/today.ts`'s
structure) and `lib/myday/calendar.ts` (month dot data).

## UI & interactions

- **`DayTimeline`** — vertical hour-row grid (~5am–11pm, scrollable).
  `myday_blocks` for the selected date render as positioned/sized cards by
  `startTime`/`endTime`. Linked blocks show a small app-color dot plus an
  actual-status indicator (checkmark when the linked task/workout is done).
  Tapping empty space or an existing block opens `AddBlockSheet`.
- **Unscheduled tray** — a chip row (above or below the timeline) for the
  selected date's auto-pulled items that have no `myday_blocks` row yet.
  Tapping a chip opens `AddBlockSheet` pre-filled with the item's title and
  `source`/`sourceId`.
- **`AddBlockSheet`** — form-only (no drag-to-reschedule in v1): title, notes,
  start/end time pickers, save/delete.
- **`MyDayCalendarDialog`** — a calendar-icon button in the page header opens
  a month grid, built with `date-fns` (no new dependency). Days with any
  `myday_blocks` row get a dot. Tapping a day navigates to `?date=`.

## Out of scope (v1)

- Drag-to-reschedule/resize on the timeline.
- Plan-vs-actual for bills/meals (no reliable schema signal).
- Recurring/templated day plans (e.g. "same every weekday").
