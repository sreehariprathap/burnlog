# My Day: auto-populate from habits, workouts, tasks, chores — design

## Problem

My Day (`docs/superpowers/specs/2026-08-31-myday-planner-design.md`) currently
treats habits, planned workouts, tasks due today, and bills due as either a
separate checklist (habits) or dismissible "unscheduled" chips that require a
manual tap-and-schedule step. HomeLog chores aren't surfaced at all. Nothing
that actually happens (a logged, unplanned workout) shows up either. The
result: My Day doesn't reflect a full day at a glance, and habits — which the
user cares most about tracking — don't occupy a slot like everything else.

## Goal

Every day-scoped item from habits, BurnLog (planned workout + any logged
session), TaskLog, and HomeLog chores automatically occupies a real,
editable slot in the My Day timeline — no manual "schedule this" step. The
existing "unscheduled" tray is renamed **Plan my day** and keeps only
MoneyLog bill reminders, the one source that's a nudge rather than something
to auto-place. Recurring personal commitments (work hours, lunch, etc.) are
explicitly out of scope — a separate follow-up spec.

## Data model

No new tables. Extends `myday_blocks` (see the original MyDay spec for full
column list):

- `source` gains two values: `'habit'`, `'homelog'` (alongside the existing
  `'manual' | 'burnlog' | 'tasklog' | 'moneylog'`).
- New partial unique index:
  ```sql
  CREATE UNIQUE INDEX myday_blocks_source_unique
    ON myday_blocks ("profileId", source, "sourceId")
    WHERE "sourceId" IS NOT NULL;
  ```
  Guarantees idempotent materialization even under concurrent reads — a
  given source row can only ever back one block per profile.

`sourceId` per source:
- `habit` → `habit_occurrences.id`
- `homelog` → `household_chore_instances.id`
- `burnlog` → either `workout_plans.id` (planned day) or `sessions.id` (a
  logged session with no corresponding plan block) — disambiguated at read
  time in `computeActual` by checking which table the id belongs to (see
  below), not by a separate source string.

## Materialization

New `lib/myday/materializeSourceBlocks.ts`, exporting
`ensureMyDaySourceBlocksMaterialized(supabase, profileId, date)`. Called from
`getMyDayForDate` right after the existing `ensureHabitOccurrences` call, so
every My Day read tops up that date's blocks before querying them.

Idempotent by construction: it only inserts for `(source, sourceId)` pairs
that don't already have a `myday_blocks` row for that date (belt-and-braces
with the partial unique index above in case of a race).

### Candidate sources, in placement priority order

| priority | source | query | default start | duration | notes |
|---|---|---|---|---|---|
| 1 (fixed) | burnlog (logged session) | `sessions` for `date`, whose `id` has no existing block | session's actual time | 60m | placed at its real time regardless of overlap — it already happened |
| 2 | habit | today's `habit_occurrences` for active habits | 07:00 | 15m | stacked sequentially |
| 3 | burnlog (planned workout) | `workout_plans` for the date's `dayOfWeek`, skip `bodyPart === 'Rest'` | `workout_plans.time` if set, else 18:00 | 60m | |
| 4 | tasklog | `tasklog_tasks` due today or `plannedForToday`, not completed | 09:00 | 30m | ordered by `position` |
| 5 | homelog | `household_chore_instances` due `date`, `assignedProfileId = profileId`, not completed | 19:00 | 20m | |

### Placement algorithm

1. Seed an "occupied intervals" list from every existing `myday_blocks` row
   for that date (manual + already-materialized).
2. Process candidates in priority order above. For each:
   - **Fixed items** (logged sessions): insert directly at their real time;
     add to occupied intervals as-is (overlaps allowed — reality doesn't
     move to accommodate the calendar).
   - **Heuristic items** (habit/workout/task/chore): starting at the
     category's default time, advance in the category's step size (15m for
     habits, 30m for tasks, 20m for chores, 60m for workout) until a free
     slot is found; cap the search at 23:00 — if nothing opens up, place at
     `23:00 − duration` and accept the overlap rather than looping forever.
   - Add the placed interval to the occupied list before processing the
     next candidate, so same-priority items never double-book each other.
3. Batch-insert all newly computed rows.

Titles: habit → `habit.title`; workout (planned) → `${bodyPart} day`;
workout (logged) → `${bodyPart} (logged)` from `sessionData`; task →
`task.title`; chore → `chore.title` (via the instance's `choreId`).

## Reading a day (`getMyDayForDate` changes)

- Call `ensureMyDaySourceBlocksMaterialized` after `ensureHabitOccurrences`.
- `computeActual` gains:
  - `'habit'` → `habit_occurrences.completed` for `sourceId`.
  - `'homelog'` → `household_chore_instances.completedAt` for `sourceId`.
  - `'burnlog'` → try `sessions` by `sourceId` first (found → `true`,
    it's a logged fact); otherwise fall back to the existing "does any
    session exist that date" check for a planned-workout block.
  - `'tasklog'` unchanged.
- The `unscheduled` computation drops the `workout_plans` and
  `tasklog_tasks` branches (now real blocks) — only the `moneylog` bill-due
  branch remains. `MyDayHabitOccurrence`/the separate `habits` array in
  `MyDayData` is removed; habits flow through `blocks` like everything else.

## UI changes

- **`DayTimeline`**: add `sourceColors.habit` (fixed accent color — habits
  span multiple apps via `sourceApp`, so no single per-app color fits) and
  `sourceColors.homelog` (`colorFor('homelog')`). The existing leading
  `CheckCircle2`/`Circle` indicator becomes a tap target
  (`stopPropagation` so it doesn't also open the edit sheet) for
  `habit`/`tasklog`/`homelog` blocks, calling a new `onToggleActual(block)`
  prop. `burnlog` blocks keep the indicator read-only.
- **`MyDayClient`**: implements `onToggleActual`:
  - `habit` → `PATCH /api/habits/occurrences/[sourceId]` (existing, two-way).
  - `tasklog` → direct Supabase `update` on `tasklog_tasks.completedAt`,
    matching how TaskLog's own board already toggles completion client-side.
  - `homelog` → `POST /api/homelog/chores/instances/[sourceId]/complete`
    (existing, one-way — no un-complete, matching current HomeLog behavior;
    the toggle is disabled once already complete).
- `HabitsChecklist` and its render in `MyDayClient` are removed (dead code
  once habits render as blocks); delete `components/myday/HabitsChecklist.tsx`.
- `UnscheduledTray` is relabeled **"Plan my day"** in its header copy; no
  structural change beyond the narrower `unscheduled` data it now receives.

## Out of scope

- Drag-to-reschedule/resize (unchanged from the original MyDay spec).
- A settings UI for customizing default times/durations per category —
  heuristic defaults are hardcoded constants for v1.
- Recurring personal commitments (work hours, lunch, etc.) — separate
  follow-up spec.
- Un-completing a chore instance (matches existing HomeLog behavior).
- Reconciling a My Day block if its source is edited after materialization
  (e.g., a task's due date moves to tomorrow) — the already-materialized
  block for today is left as-is, consistent with blocks being independent
  rows once created.
