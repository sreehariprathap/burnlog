# My Day Auto-Populate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habits, planned workouts, logged workout sessions, tasks due today, and assigned HomeLog chores all automatically occupy a real, editable slot in My Day's timeline — no manual "schedule this" step required.

**Architecture:** A pure placement algorithm (`lib/myday/placement.ts`) decides where each un-timed item lands given what's already occupied; a thin Supabase wrapper (`lib/myday/materializeSourceBlocks.ts`) gathers candidates from five source tables and inserts them as real `myday_blocks` rows once per source item (idempotent, mirrors the existing `lib/habits/materialize.ts` pattern). `getMyDayForDate` calls the materializer before reading blocks, so every read tops up that date. The UI unifies habits into the timeline (removing the separate checklist) and narrows the "unscheduled" tray to bill reminders only, relabeled "Plan my day".

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + supabase-js), Prisma (schema/migrations), Vitest, date-fns.

**Spec:** `docs/superpowers/specs/2026-09-09-myday-auto-populate-design.md`

## Global Constraints

- No new tables — only a new partial unique index on the existing `myday_blocks` table.
- Auto-materialized blocks are independent rows once created (editing/moving in My Day never writes back to the source); completion status still reads live from the source table via `computeActual`.
- Logged workout sessions are placed at their real timestamp and are never shifted to avoid overlap; every other auto-placed item is shifted forward within its category's step size, capped at 23:00.
- HomeLog chore completion from My Day is one-way (matches existing HomeLog behavior — no un-complete).
- Recurring personal commitments (work hours, lunch, etc.) are explicitly out of scope for this plan.

---

### Task 1: Schema — unique index on `myday_blocks` source columns

**Files:**
- Modify: `prisma/schema.prisma` (the `MydayBlock` model's `source` comment)
- Create: `prisma/migrations/20260909010000_add_myday_blocks_source_unique/migration.sql`

**Interfaces:**
- Produces: a partial unique index `myday_blocks_source_unique` on `("profileId", "source", "sourceId") WHERE "sourceId" IS NOT NULL` — later tasks' inserts should tolerate a `23505` unique-violation error code as "already materialized, ignore" rather than treating it as a hard failure.

- [ ] **Step 1: Update the schema comment**

In `prisma/schema.prisma`, find the `MydayBlock` model (`@@map("myday_blocks")`) and update the `source` field's comment:

```prisma
  source    String   @default("manual") // 'manual' | 'burnlog' | 'tasklog' | 'moneylog' | 'habit' | 'homelog'
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260909010000_add_myday_blocks_source_unique/migration.sql`:

```sql
-- CreateIndex
CREATE UNIQUE INDEX "myday_blocks_source_unique"
  ON "myday_blocks" ("profileId", "source", "sourceId")
  WHERE "sourceId" IS NOT NULL;
```

- [ ] **Step 3: Apply the migration to the connected Supabase project**

Use the `mcp__supabase__apply_migration` tool with:
- `name`: `add_myday_blocks_source_unique`
- `query`: the SQL from Step 2

Then mark it applied in Prisma's migration history so `prisma migrate deploy` doesn't try to re-run it:

```bash
npx prisma migrate resolve --applied 20260909010000_add_myday_blocks_source_unique
npx prisma generate
```

- [ ] **Step 4: Verify the index exists**

Run via `mcp__supabase__execute_sql`:

```sql
select indexname, indexdef from pg_indexes where tablename = 'myday_blocks';
```

Expected: `myday_blocks_source_unique` appears in the results.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260909010000_add_myday_blocks_source_unique
git commit -m "$(cat <<'EOF'
feat(myday): add unique index guarding against duplicate source blocks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 2: Placement algorithm (pure logic, TDD)

**Files:**
- Create: `lib/myday/placement.ts`
- Test: `lib/myday/placement.test.ts`

**Interfaces:**
- Produces:
  - `TimeInterval { startTime: string; endTime: string }`
  - `PlacementSource = 'habit' | 'burnlog' | 'tasklog' | 'homelog'`
  - `PlacementCandidate { key: string; source: PlacementSource; sourceId: string; title: string; fixedStartTime?: string; desiredStartTime: string; durationMinutes: number; stepMinutes: number }`
  - `PlacedBlock { key: string; source: PlacementSource; sourceId: string; title: string; startTime: string; endTime: string }`
  - `placeCandidates(candidates: PlacementCandidate[], existing: TimeInterval[]): PlacedBlock[]`
- Consumes: nothing (pure, no I/O). Candidates are processed in the order given — the caller (Task 3) controls priority by array order.

- [ ] **Step 1: Write the failing tests**

Create `lib/myday/placement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placeCandidates, type PlacementCandidate, type TimeInterval } from './placement';

function candidate(overrides: Partial<PlacementCandidate>): PlacementCandidate {
  return {
    key: 'k',
    source: 'habit',
    sourceId: 'id',
    title: 'Item',
    desiredStartTime: '07:00',
    durationMinutes: 15,
    stepMinutes: 15,
    ...overrides,
  };
}

describe('placeCandidates', () => {
  it('places a single candidate at its desired time when nothing is occupied', () => {
    const result = placeCandidates([candidate({ desiredStartTime: '07:00', durationMinutes: 15 })], []);
    expect(result).toEqual([
      { key: 'k', source: 'habit', sourceId: 'id', title: 'Item', startTime: '07:00', endTime: '07:15' },
    ]);
  });

  it('shifts forward by the step size when the desired slot is already occupied', () => {
    const existing: TimeInterval[] = [{ startTime: '07:00', endTime: '07:15' }];
    const result = placeCandidates(
      [candidate({ key: 'k2', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 })],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '07:15', endTime: '07:30' });
  });

  it('stacks multiple candidates sequentially without overlapping each other', () => {
    const result = placeCandidates(
      [
        candidate({ key: 'h1', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
        candidate({ key: 'h2', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
        candidate({ key: 'h3', desiredStartTime: '07:00', durationMinutes: 15, stepMinutes: 15 }),
      ],
      []
    );
    expect(result.map((r) => [r.startTime, r.endTime])).toEqual([
      ['07:00', '07:15'],
      ['07:15', '07:30'],
      ['07:30', '07:45'],
    ]);
  });

  it('places a fixed-time candidate at its exact time even if it overlaps an existing block', () => {
    const existing: TimeInterval[] = [{ startTime: '18:00', endTime: '19:00' }];
    const result = placeCandidates(
      [
        candidate({
          key: 'session',
          source: 'burnlog',
          fixedStartTime: '18:30',
          desiredStartTime: '18:30',
          durationMinutes: 60,
          stepMinutes: 60,
        }),
      ],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '18:30', endTime: '19:30' });
  });

  it('clamps to the 23:00 day-end cap and accepts overlap when no free slot exists', () => {
    // Occupy every 30-minute slot from 09:00 to 23:00 so a 30-minute task
    // candidate starting at 09:00 can never find a free slot.
    const existing: TimeInterval[] = [{ startTime: '09:00', endTime: '23:00' }];
    const result = placeCandidates(
      [candidate({ key: 't1', source: 'tasklog', desiredStartTime: '09:00', durationMinutes: 30, stepMinutes: 30 })],
      existing
    );
    expect(result[0]).toMatchObject({ startTime: '22:30', endTime: '23:00' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/myday/placement.test.ts`
Expected: FAIL — `Cannot find module './placement'`

- [ ] **Step 3: Implement `lib/myday/placement.ts`**

```ts
// lib/myday/placement.ts
//
// Pure scheduling logic: given a list of candidate items that each want a
// slot on a day's timeline, and the intervals already occupied, decides
// exact start/end times. No I/O — see lib/myday/materializeSourceBlocks.ts
// for the Supabase-backed wrapper that gathers candidates and inserts the
// result as myday_blocks rows.

export interface TimeInterval {
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
}

export type PlacementSource = 'habit' | 'burnlog' | 'tasklog' | 'homelog';

export interface PlacementCandidate {
  key: string; // stable identifier, e.g. `habit:${occurrenceId}`
  source: PlacementSource;
  sourceId: string;
  title: string;
  // Set only for items that already happened (a logged workout session) —
  // placed at this exact time regardless of overlap. Omit for everything else.
  fixedStartTime?: string;
  desiredStartTime: string; // 'HH:mm' category default, used when fixedStartTime is unset
  durationMinutes: number;
  stepMinutes: number; // increment used when searching forward for a free slot
}

export interface PlacedBlock {
  key: string;
  source: PlacementSource;
  sourceId: string;
  title: string;
  startTime: string;
  endTime: string;
}

const DAY_END_MINUTES = 23 * 60; // 23:00 cap, matches DayTimeline's visible range

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function placeCandidates(candidates: PlacementCandidate[], existing: TimeInterval[]): PlacedBlock[] {
  const occupied = existing.map((iv) => ({ start: timeToMinutes(iv.startTime), end: timeToMinutes(iv.endTime) }));
  const placed: PlacedBlock[] = [];

  for (const candidate of candidates) {
    let start: number;

    if (candidate.fixedStartTime) {
      start = timeToMinutes(candidate.fixedStartTime);
    } else {
      start = timeToMinutes(candidate.desiredStartTime);
      while (occupied.some((iv) => overlaps(start, start + candidate.durationMinutes, iv.start, iv.end))) {
        if (start + candidate.stepMinutes + candidate.durationMinutes > DAY_END_MINUTES) {
          start = Math.max(0, DAY_END_MINUTES - candidate.durationMinutes);
          break;
        }
        start += candidate.stepMinutes;
      }
    }

    const end = start + candidate.durationMinutes;
    occupied.push({ start, end });
    placed.push({
      key: candidate.key,
      source: candidate.source,
      sourceId: candidate.sourceId,
      title: candidate.title,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    });
  }

  return placed;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/myday/placement.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/myday/placement.ts lib/myday/placement.test.ts
git commit -m "$(cat <<'EOF'
feat(myday): add pure slot-placement algorithm

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 3: Materializer — Supabase wrapper

**Files:**
- Create: `lib/myday/materializeSourceBlocks.ts`

**Interfaces:**
- Consumes: `placeCandidates`, `PlacementCandidate`, `TimeInterval` from `lib/myday/placement.ts` (Task 2).
- Produces: `ensureMyDaySourceBlocksMaterialized(supabase: SupabaseClient, profileId: string, date: string): Promise<void>` — called by Task 4's `getMyDayForDate`.
- No unit test for this file: it's pure Supabase orchestration across five tables with no branching logic worth mocking — same precedent as the untested `lib/habits/materialize.ts` (its logic-bearing half, `computeMissingOccurrences`, is what's tested; the I/O wrapper isn't). This task's logic-bearing half (`placeCandidates`) is already tested in Task 2. Verified manually in Task 8.

- [ ] **Step 1: Implement `lib/myday/materializeSourceBlocks.ts`**

```ts
// lib/myday/materializeSourceBlocks.ts
//
// Tops up myday_blocks for a profile/date with real rows for every
// un-scheduled source item that should occupy a slot: habits due that day,
// the planned workout (skipping Rest days), any logged workout session with
// no matching plan block, tasks due/planned for today, and HomeLog chores
// assigned to this profile due today. Idempotent: only inserts for
// (source, sourceId) pairs that don't already have a block for that date,
// and the myday_blocks_source_unique index (see the Task 1 migration)
// guards against a race inserting the same source item twice.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDay, format } from 'date-fns';
import { placeCandidates, type PlacementCandidate, type TimeInterval } from './placement';

const HABIT_DEFAULT = { start: '07:00', duration: 15, step: 15 };
const WORKOUT_DEFAULT = { start: '18:00', duration: 60, step: 60 };
const TASK_DEFAULT = { start: '09:00', duration: 30, step: 30 };
const CHORE_DEFAULT = { start: '19:00', duration: 20, step: 20 };
const LOGGED_SESSION_DURATION = 60;

interface ExistingBlockRow {
  startTime: string;
  endTime: string;
  source: string;
  sourceId: string | null;
}

export async function ensureMyDaySourceBlocksMaterialized(
  supabase: SupabaseClient,
  profileId: string,
  date: string
): Promise<void> {
  const { data: existingBlocks } = await supabase
    .from('myday_blocks')
    .select('startTime, endTime, source, sourceId')
    .eq('profileId', profileId)
    .eq('date', date);

  const rows = (existingBlocks as ExistingBlockRow[]) || [];
  const existingIntervals: TimeInterval[] = rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
  const existingKeys = new Set(rows.filter((r) => r.sourceId).map((r) => `${r.source}:${r.sourceId}`));

  const dayOfWeek = getDay(new Date(`${date}T00:00:00`));
  const candidates: PlacementCandidate[] = [];

  // 1. Logged sessions (fixed — placed at their real time, highest priority)
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, date, sessionData')
    .eq('profileId', profileId)
    .gte('date', `${date}T00:00:00`)
    .lt('date', `${date}T23:59:59.999`);
  for (const session of (sessions as { id: string; date: string; sessionData: { bodyPart?: string } | null }[]) || []) {
    const key = `burnlog:${session.id}`;
    if (existingKeys.has(key)) continue;
    const time = format(new Date(session.date), 'HH:mm');
    candidates.push({
      key,
      source: 'burnlog',
      sourceId: session.id,
      title: session.sessionData?.bodyPart ? `${session.sessionData.bodyPart} (logged)` : 'Workout (logged)',
      fixedStartTime: time,
      desiredStartTime: time,
      durationMinutes: LOGGED_SESSION_DURATION,
      stepMinutes: LOGGED_SESSION_DURATION,
    });
  }

  // 2. Habits due today
  const { data: habits } = await supabase
    .from('habits')
    .select('id, title')
    .eq('profileId', profileId)
    .eq('isActive', true);
  const habitById = new Map(((habits as { id: string; title: string }[]) || []).map((h) => [h.id, h]));
  if (habitById.size > 0) {
    const { data: occurrences } = await supabase
      .from('habit_occurrences')
      .select('id, habitId')
      .eq('date', date)
      .in('habitId', Array.from(habitById.keys()));
    for (const occurrence of (occurrences as { id: string; habitId: string }[]) || []) {
      const key = `habit:${occurrence.id}`;
      if (existingKeys.has(key)) continue;
      const habit = habitById.get(occurrence.habitId);
      if (!habit) continue;
      candidates.push({
        key,
        source: 'habit',
        sourceId: occurrence.id,
        title: habit.title,
        desiredStartTime: HABIT_DEFAULT.start,
        durationMinutes: HABIT_DEFAULT.duration,
        stepMinutes: HABIT_DEFAULT.step,
      });
    }
  }

  // 3. Planned workout for this day-of-week (skip Rest)
  const { data: plans } = await supabase
    .from('workout_plans')
    .select('id, bodyPart, time')
    .eq('profileId', profileId)
    .eq('dayOfWeek', dayOfWeek);
  for (const plan of (plans as { id: string; bodyPart: string; time: string | null }[]) || []) {
    if (plan.bodyPart === 'Rest') continue;
    const key = `burnlog:${plan.id}`;
    if (existingKeys.has(key)) continue;
    candidates.push({
      key,
      source: 'burnlog',
      sourceId: plan.id,
      title: `${plan.bodyPart} day`,
      desiredStartTime: plan.time ?? WORKOUT_DEFAULT.start,
      durationMinutes: WORKOUT_DEFAULT.duration,
      stepMinutes: WORKOUT_DEFAULT.step,
    });
  }

  // 4. Tasks due today or planned for today, not completed
  const { data: tasks } = await supabase
    .from('tasklog_tasks')
    .select('id, title, completedAt')
    .eq('profileId', profileId)
    .or(`dueDate.eq.${date},plannedForToday.eq.true`)
    .order('position', { ascending: true });
  for (const task of (tasks as { id: string; title: string; completedAt: string | null }[]) || []) {
    if (task.completedAt) continue;
    const key = `tasklog:${task.id}`;
    if (existingKeys.has(key)) continue;
    candidates.push({
      key,
      source: 'tasklog',
      sourceId: task.id,
      title: task.title,
      desiredStartTime: TASK_DEFAULT.start,
      durationMinutes: TASK_DEFAULT.duration,
      stepMinutes: TASK_DEFAULT.step,
    });
  }

  // 5. HomeLog chores assigned to this profile, due today, not completed
  const { data: choreInstances } = await supabase
    .from('household_chore_instances')
    .select('id, choreId')
    .eq('assignedProfileId', profileId)
    .eq('dueDate', date)
    .is('completedAt', null);
  const instanceRows = (choreInstances as { id: string; choreId: string }[]) || [];
  if (instanceRows.length > 0) {
    const { data: choreDefs } = await supabase
      .from('household_chores')
      .select('id, title')
      .in('id', instanceRows.map((i) => i.choreId));
    const titleByChoreId = new Map(((choreDefs as { id: string; title: string }[]) || []).map((c) => [c.id, c.title]));
    for (const instance of instanceRows) {
      const key = `homelog:${instance.id}`;
      if (existingKeys.has(key)) continue;
      candidates.push({
        key,
        source: 'homelog',
        sourceId: instance.id,
        title: titleByChoreId.get(instance.choreId) ?? 'Chore',
        desiredStartTime: CHORE_DEFAULT.start,
        durationMinutes: CHORE_DEFAULT.duration,
        stepMinutes: CHORE_DEFAULT.step,
      });
    }
  }

  if (candidates.length === 0) return;

  const placed = placeCandidates(candidates, existingIntervals);

  const { error } = await supabase.from('myday_blocks').insert(
    placed.map((p) => ({
      profileId,
      date,
      title: p.title,
      notes: null,
      startTime: p.startTime,
      endTime: p.endTime,
      source: p.source,
      sourceId: p.sourceId,
      completed: false,
    }))
  );
  // 23505 = unique_violation — another concurrent read already materialized
  // one of these (guarded by myday_blocks_source_unique); safe to ignore.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/myday/materializeSourceBlocks.ts
git commit -m "$(cat <<'EOF'
feat(myday): materialize habits/workouts/tasks/chores into real day blocks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 4: Wire the materializer into `getMyDayForDate`, extend `computeActual`, update types

**Files:**
- Modify: `lib/myday/types.ts`
- Modify: `lib/myday/day.ts`

**Interfaces:**
- Consumes: `ensureMyDaySourceBlocksMaterialized` from Task 3.
- Produces: `MyDaySource` now includes `'habit' | 'homelog'`; `MyDayData` no longer has a `habits` field (habits arrive via `blocks`); `computeActual` handles all six sources.

- [ ] **Step 1: Update `lib/myday/types.ts`**

Replace the whole file with:

```ts
// lib/myday/types.ts
export type MyDaySource = 'manual' | 'burnlog' | 'tasklog' | 'moneylog' | 'habit' | 'homelog';

export interface MyDayBlock {
  id: string;
  title: string;
  notes: string | null;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  source: MyDaySource;
  sourceId: string | null;
  completed: boolean;
  actual: boolean | null; // null = no actual-status signal for this source
}

export interface MyDayUnscheduledItem {
  key: string; // stable React key, e.g. `moneylog:${id}`
  title: string;
  source: Extract<MyDaySource, 'moneylog'>;
  sourceId: string;
  label: string; // e.g. 'Bill due'
}

export interface MyDayData {
  date: string; // 'yyyy-MM-dd'
  blocks: MyDayBlock[];
  unscheduled: MyDayUnscheduledItem[];
}

export interface MyDayCalendarMonth {
  month: string; // 'yyyy-MM'
  daysWithBlocks: string[]; // 'yyyy-MM-dd'
}
```

- [ ] **Step 2: Update `lib/myday/day.ts`**

Replace the whole file with:

```ts
// lib/myday/day.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDay, getDate as getDateOfMonth } from 'date-fns';
import type { RecurringItemRow } from '@/lib/financePeriods';
import { ensureHabitOccurrences } from '@/lib/habits/materialize';
import { ensureMyDaySourceBlocksMaterialized } from './materializeSourceBlocks';
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from './types';

interface MyDayBlockRow {
  id: string;
  title: string;
  notes: string | null;
  startTime: string;
  endTime: string;
  source: string;
  sourceId: string | null;
  completed: boolean;
}

async function computeActual(
  supabase: SupabaseClient,
  profileId: string,
  source: string,
  sourceId: string | null,
  date: string
): Promise<boolean | null> {
  if (!sourceId) return null;

  if (source === 'tasklog') {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('completedAt')
      .eq('id', sourceId)
      .eq('profileId', profileId)
      .maybeSingle();
    return data ? Boolean(data.completedAt) : null;
  }

  if (source === 'habit') {
    const { data } = await supabase
      .from('habit_occurrences')
      .select('completed')
      .eq('id', sourceId)
      .maybeSingle();
    return data ? Boolean(data.completed) : null;
  }

  if (source === 'homelog') {
    const { data } = await supabase
      .from('household_chore_instances')
      .select('completedAt')
      .eq('id', sourceId)
      .maybeSingle();
    return data ? Boolean(data.completedAt) : null;
  }

  if (source === 'burnlog') {
    // sourceId is either a sessions.id (a logged block — already happened,
    // definitely "actual") or a workout_plans.id (a planned-day block, whose
    // actual status is "did any session get logged that date").
    const { data: session } = await supabase.from('sessions').select('id').eq('id', sourceId).maybeSingle();
    if (session) return true;

    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('profileId', profileId)
      .gte('date', `${date}T00:00:00`)
      .lt('date', `${date}T23:59:59.999`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  return null;
}

export async function getMyDayForDate(supabase: SupabaseClient, profileId: string, date: string): Promise<MyDayData> {
  await ensureHabitOccurrences(supabase, profileId, date);
  await ensureMyDaySourceBlocksMaterialized(supabase, profileId, date);

  const { data: blockRows } = await supabase
    .from('myday_blocks')
    .select('id, title, notes, startTime, endTime, source, sourceId, completed')
    .eq('profileId', profileId)
    .eq('date', date)
    .order('startTime', { ascending: true });

  const rows = (blockRows as MyDayBlockRow[]) || [];
  const blocks: MyDayBlock[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      startTime: row.startTime,
      endTime: row.endTime,
      source: row.source as MyDayBlock['source'],
      sourceId: row.sourceId,
      completed: row.completed,
      actual: await computeActual(supabase, profileId, row.source, row.sourceId, date),
    }))
  );

  const target = new Date(`${date}T00:00:00`);
  const dayOfMonth = getDateOfMonth(target);
  const dayOfWeek = getDay(target);

  const { data: recurringRes } = await supabase
    .from('recurring_items')
    .select('*')
    .eq('profileId', profileId)
    .eq('isActive', true)
    .eq('type', 'expense');

  const scheduledSourceIds = new Set(rows.filter((r) => r.sourceId).map((r) => r.sourceId as string));
  const unscheduled: MyDayUnscheduledItem[] = [];
  const recurringItems = (recurringRes as RecurringItemRow[]) || [];
  for (const item of recurringItems) {
    const isDueToday =
      (item.frequency === 'monthly' && item.dayOfMonth === dayOfMonth) ||
      (item.frequency === 'weekly' && item.dayOfWeek === dayOfWeek) ||
      (item.frequency === 'yearly' && item.dayOfMonth === dayOfMonth);
    if (!isDueToday) continue;
    if (scheduledSourceIds.has(item.id)) continue;
    unscheduled.push({
      key: `moneylog:${item.id}`,
      title: item.label,
      source: 'moneylog',
      sourceId: item.id,
      label: 'Bill due',
    });
  }

  return { date, blocks, unscheduled };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (existing errors, if any, are unrelated — see Task 6 for the consumers of the removed `habits` field).

- [ ] **Step 4: Commit**

```bash
git add lib/myday/types.ts lib/myday/day.ts
git commit -m "$(cat <<'EOF'
feat(myday): wire source-block materialization into the day read path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 5: `DayTimeline` — colors and toggle for habit/task/chore blocks

**Files:**
- Modify: `components/myday/DayTimeline.tsx`

**Interfaces:**
- Consumes: `MyDayBlock` (Task 4's updated `source` union).
- Produces: `DayTimelineProps` gains `onToggleActual: (block: MyDayBlock) => void`, consumed by Task 6's `MyDayClient`.

- [ ] **Step 1: Replace the file**

```tsx
'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyDayBlock } from '@/lib/myday/types';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';

interface DayTimelineProps {
  blocks: MyDayBlock[];
  onBlockClick: (block: MyDayBlock) => void;
  onSlotClick: (startTime: string) => void;
  onToggleActual: (block: MyDayBlock) => void;
}

const START_HOUR = 5;
const END_HOUR = 23;
const ROW_HEIGHT_PX = 64;

// Sources whose "actual" status can be toggled from My Day directly.
// burnlog is read-only here — you can't toggle a workout into existing.
const TOGGLEABLE_SOURCES: MyDayBlock['source'][] = ['habit', 'tasklog', 'homelog'];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export function DayTimeline({ blocks, onBlockClick, onSlotClick, onToggleActual }: DayTimelineProps) {
  const { colorFor } = useAppThemeColors();
  const sourceColors: Record<MyDayBlock['source'], string> = {
    manual: 'var(--muted-foreground)',
    burnlog: colorFor('burnlog'),
    tasklog: colorFor('tasklog'),
    moneylog: colorFor('moneylog'),
    homelog: colorFor('homelog'),
    habit: 'var(--chart-2)',
  };
  const gridStartMinutes = START_HOUR * 60;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="relative">
      {hours.map((hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onSlotClick(`${String(hour).padStart(2, '0')}:00`)}
          className="flex w-full items-start gap-3 border-t text-left"
          style={{ height: ROW_HEIGHT_PX }}
        >
          <span className="w-12 shrink-0 pt-1 text-xs text-muted-foreground">{formatHourLabel(hour)}</span>
        </button>
      ))}

      <div className="pointer-events-none absolute inset-0 left-14">
        {blocks.map((block) => {
          const top = ((timeToMinutes(block.startTime) - gridStartMinutes) / 60) * ROW_HEIGHT_PX;
          const height = Math.max(
            24,
            ((timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60) * ROW_HEIGHT_PX
          );
          const color = sourceColors[block.source];
          const canToggle = TOGGLEABLE_SOURCES.includes(block.source) && block.actual !== null && !(block.source === 'homelog' && block.actual);

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onBlockClick(block)}
              className="pointer-events-auto absolute left-0 right-2 rounded-md border-l-4 bg-card p-2 text-left shadow-sm"
              style={{ top, height, borderLeftColor: color }}
            >
              <div className="flex items-center gap-1.5">
                {block.actual !== null && (
                  <span
                    role={canToggle ? 'button' : undefined}
                    aria-label={canToggle ? 'Toggle complete' : undefined}
                    onClick={(e) => {
                      if (!canToggle) return;
                      e.stopPropagation();
                      onToggleActual(block);
                    }}
                  >
                    {block.actual ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                )}
                <p className={cn('truncate text-xs font-medium', block.completed && 'text-muted-foreground line-through')}>
                  {block.title}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {block.startTime}–{block.endTime}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: errors only in `MyDayClient.tsx` (fixed in Task 6) — none in `DayTimeline.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add components/myday/DayTimeline.tsx
git commit -m "$(cat <<'EOF'
feat(myday): color and toggle habit/chore/task blocks in the timeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 6: `MyDayClient` — remove the habits checklist, wire toggling

**Files:**
- Modify: `app/(logbook)/logbook/myday/_components/MyDayClient.tsx`
- Delete: `components/myday/HabitsChecklist.tsx`

**Interfaces:**
- Consumes: `DayTimeline`'s `onToggleActual` prop (Task 5); `markTaskComplete` from `lib/tasklog/completeTask.ts` (existing — handles streak/goal-progress side effects, must be reused rather than a raw update); `StreakProfile` from `lib/tasklog/streak.ts` (existing).

- [ ] **Step 1: Delete the now-unused checklist component**

```bash
rm components/myday/HabitsChecklist.tsx
```

- [ ] **Step 2: Replace `MyDayClient.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarClock, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { format as formatDate, addDays, subDays } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { ThemedButton } from '@/components/ui/themed-button';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { markTaskComplete } from '@/lib/tasklog/completeTask';
import type { StreakProfile } from '@/lib/tasklog/streak';
import { DayTimeline } from '@/components/myday/DayTimeline';
import { UnscheduledTray } from '@/components/myday/UnscheduledTray';
import { AddBlockSheet } from '@/components/myday/AddBlockSheet';
import { MyDayCalendarDialog } from '@/components/myday/MyDayCalendarDialog';
import { HabitCreateSheet } from '@/components/myday/HabitCreateSheet';
import { RadialMenu, type RadialMenuItem } from '@/components/kokonutui/radial-menu';
import type { MyDayBlock, MyDayUnscheduledItem } from '@/lib/myday/types';
import { myDayQuery, todayKey } from '@/lib/logbook/queries';

type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock }
  | { mode: 'newHabit' };

export function MyDayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') ?? todayKey();
  const { profile } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(
    profile ? myDayQuery(date).key : null,
    profile ? myDayQuery(date).fetcher : null
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const goToDate = (next: string) => router.push(`/logbook?tab=myday&date=${next}`);

  const dateLabel = useMemo(() => formatDate(new Date(`${date}T00:00:00`), 'EEEE, MMM d'), [date]);

  const closeSheet = () => setSheet({ mode: 'closed' });
  const handleSheetSaved = () => {
    mutate();
    closeSheet();
  };

  async function handleToggleActual(block: MyDayBlock) {
    if (!block.sourceId) return;
    const supabase = createClient();

    if (block.source === 'habit') {
      await fetch(`/api/habits/occurrences/${block.sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !block.actual }),
      });
    } else if (block.source === 'tasklog') {
      if (!profile) return;
      const { data: task } = await supabase
        .from('tasklog_tasks')
        .select('id, goalId, title, cost, costCategory, costLoggedAt')
        .eq('id', block.sourceId)
        .single();
      if (!task) return;
      const streakProfile: StreakProfile = {
        id: profile.id,
        taskLogCurrentStreak: profile.taskLogCurrentStreak,
        taskLogLongestStreak: profile.taskLogLongestStreak,
        lastTaskLogStreakDate: profile.lastTaskLogStreakDate,
      };
      await markTaskComplete(supabase, task, streakProfile, !block.actual);
    } else if (block.source === 'homelog') {
      if (block.actual) return; // one-way, matches HomeLog's own completion flow
      await fetch(`/api/homelog/chores/instances/${block.sourceId}/complete`, { method: 'POST' });
    }

    mutate();
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar
        title="MyDay"
        actions={
          <>
            <button type="button" onClick={() => setCalendarOpen(true)} aria-label="Open calendar" className="flex items-center justify-center">
              <CalendarDays className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => mutate()} aria-label="Refresh" className="flex items-center justify-center">
              <RefreshCw className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous day"
            onClick={() => goToDate(formatDate(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}
          >
            ←
          </Button>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next day"
            onClick={() => goToDate(formatDate(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}
          >
            →
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!isLoading && error && <p className="text-sm text-muted-foreground">Couldn&apos;t load MyDay.</p>}

        {!isLoading && data && (
          <>
            <UnscheduledTray items={data.unscheduled} onSelect={(item) => setSheet({ mode: 'fromUnscheduled', item })} />
            <DayTimeline
              blocks={data.blocks}
              onBlockClick={(block) => setSheet({ mode: 'edit', block })}
              onSlotClick={(startTime) => setSheet({ mode: 'new', startTime })}
              onToggleActual={handleToggleActual}
            />
          </>
        )}
      </div>

      <ThemedButton
        slot="fab"
        onClick={() => setFabMenuOpen((prev) => !prev)}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add to your day"
      >
        <Plus className="h-6 w-6" />
      </ThemedButton>

      <RadialMenu
        open={fabMenuOpen}
        onClose={() => setFabMenuOpen(false)}
        items={
          [
            {
              key: 'block',
              label: 'Block',
              icon: <CalendarClock className="h-5 w-5" />,
              onSelect: () => setSheet({ mode: 'new' }),
            },
            {
              key: 'habit',
              label: 'Habit',
              icon: <Plus className="h-5 w-5" />,
              onSelect: () => setSheet({ mode: 'newHabit' }),
            },
          ] satisfies RadialMenuItem[]
        }
      />

      {sheet.mode === 'newHabit' && <HabitCreateSheet date={date} onClose={closeSheet} onSaved={handleSheetSaved} />}

      {sheet.mode === 'new' && (
        <AddBlockSheet date={date} initialStartTime={sheet.startTime} onClose={closeSheet} onSaved={handleSheetSaved} />
      )}
      {sheet.mode === 'fromUnscheduled' && (
        <AddBlockSheet
          date={date}
          prefillTitle={sheet.item.title}
          prefillSource={sheet.item.source}
          prefillSourceId={sheet.item.sourceId}
          onClose={closeSheet}
          onSaved={handleSheetSaved}
        />
      )}
      {sheet.mode === 'edit' && <AddBlockSheet date={date} block={sheet.block} onClose={closeSheet} onSaved={handleSheetSaved} />}

      <MyDayCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} selectedDate={date} onSelectDate={goToDate} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors in `MyDayClient.tsx` or `DayTimeline.tsx`. If `profile` from `useCurrentProfile()` isn't typed with `taskLogCurrentStreak`/`taskLogLongestStreak`/`lastTaskLogStreakDate`, check `lib/useCurrentProfile.ts`'s `fetchCurrentProfile` return type — it selects `'*'` from `profiles`, so these columns are present in the runtime data; if the TS type is too narrow, widen the cast at the `streakProfile` construction site (e.g. `profile as unknown as StreakProfile`-shaped fields) rather than loosening `StreakProfile` itself.

- [ ] **Step 4: Commit**

```bash
git add app/\(logbook\)/logbook/myday/_components/MyDayClient.tsx components/myday/HabitsChecklist.tsx
git commit -m "$(cat <<'EOF'
feat(myday): unify habits into the timeline, wire completion toggling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 7: Relabel the unscheduled tray "Plan my day"

**Files:**
- Modify: `components/myday/UnscheduledTray.tsx`

**Interfaces:**
- Consumes: `MyDayUnscheduledItem` from `lib/myday/types.ts` (Task 4's narrowed type — `source` is now always `'moneylog'`).

- [ ] **Step 1: Replace the file**

```tsx
'use client';

import { Wallet } from 'lucide-react';
import type { MyDayUnscheduledItem } from '@/lib/myday/types';

interface UnscheduledTrayProps {
  items: MyDayUnscheduledItem[];
  onSelect: (item: MyDayUnscheduledItem) => void;
}

export function UnscheduledTray({ items, onSelect }: UnscheduledTrayProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Plan my day</p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p . && npx eslint components/myday/UnscheduledTray.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/myday/UnscheduledTray.tsx
git commit -m "$(cat <<'EOF'
feat(myday): relabel the unscheduled tray \"Plan my day\"

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwL55v6UKWkoV5jpsTmcoL
EOF
)"
```

---

### Task 8: Full-suite verification and manual QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 5 new `placement.test.ts` cases.

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit -p . && npx eslint .`
Expected: no errors.

- [ ] **Step 3: Manual QA against a live dev server**

Start the dev server (`npm run dev`) and, signed in as a profile with at least one active habit, a workout plan, a task due today, and (if in a household) a chore due today assigned to you:

1. Open My Day for today. Confirm habits, the planned workout, the due task, and the due chore each appear as their own card in the timeline (not a separate checklist, not a dismissible chip).
2. Confirm no two auto-placed cards occupy the exact same time range (the placement algorithm should have shifted any collision forward).
3. Tap a habit card's checkmark — confirm it toggles and the change persists on refresh (`RefreshCw` button or reload).
4. Tap a task card's checkmark — confirm the task also shows completed in TaskLog's board.
5. Tap a chore card's checkmark — confirm it can't be un-toggled (one-way), and that it shows completed in HomeLog's chores list.
6. Log a workout session today outside of the plan (BurnLog session logging) with no corresponding plan entry for today, or on a day the plan says "Rest" — reload My Day and confirm a "(logged)" card appears at the session's real logged time.
7. Confirm the "Plan my day" section only shows bill-due reminders now (no workout/task chips left in it).
8. Edit an auto-placed block's time in My Day (tap it, change the time, save) — confirm it persists independently and doesn't revert on the next reload.

Report any mismatch against the spec (`docs/superpowers/specs/2026-09-09-myday-auto-populate-design.md`) before considering this plan complete.

- [ ] **Step 4: Commit** (only if Step 3 surfaced fixes; otherwise this task has nothing to commit)
