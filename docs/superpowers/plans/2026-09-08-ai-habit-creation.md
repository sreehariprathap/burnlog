# AI-Assisted Habit Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create a habit from a single sentence in My Day, have AI route it to the right app and suggest recurrence, customize the recurrence, and see/check it off daily in My Day.

**Architecture:** A new `Habit`/`HabitOccurrence` pair of Postgres tables (queried via the Supabase client, matching every existing model in this codebase — there is no runtime Prisma Client usage anywhere, only `prisma/schema.prisma` + migrations for schema, then `supabase.from(...)` for reads/writes) holds habits and their per-day materialized occurrences. A pure `lib/habits/habitRecurrence.ts` module computes which dates a habit is due on; a thin `lib/habits/materialize.ts` wrapper uses it to top up occurrence rows on demand (on habit creation and lazily whenever My Day is loaded for a date). A new `POST /api/ai/classify-habit` route (same shape as the existing `categorize-task` route) turns freeform text into `{ title, sourceApp, isRecurring, suggestedRecurrence }`. A 3-step `HabitCreateSheet` (capture → confirm app/one-time-vs-recurring → recurrence detail) posts to `POST /api/habits`. My Day's FAB gains a "Habit" option alongside the existing "Block" option, and renders due occurrences in a new `HabitsChecklist`, colored via the theming system already used by `DayTimeline` (`useAppThemeColors().colorFor`).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma 6 (schema/migrations only) + Postgres via Supabase, Supabase client for all runtime queries, SWR for client data fetching, Tailwind, `date-fns`, `motion/react`, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-09-08-ai-habit-creation-design.md`

## Global Constraints

- No real speech-to-text this round — the capture screen is a text box; the Siri orb is decorative (animates `idle`/`thinking` only).
- Recurrence is `once` | `daily` | `weekly` (with a `daysOfWeek` set and `intervalWeeks`) and an end condition of `never` | `on_date` | `after_n` — no general RRULE engine.
- All new tables are queried through the Supabase client (`admin.from('habits')` etc.), never through a Prisma Client instance — this matches every existing model in the codebase (see `lib/homelog/day.ts`, `lib/myday/day.ts`, `lib/ai/jobs.ts`).
- New Prisma models follow the existing convention exactly: `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`, camelCase column names (no `@map` per-field), and a table-level `@@map("snake_case_table_name")`.
- A misclassification or a bad/missing AI response must never block habit creation — always fall through to an editable default (`sourceApp: null`, `isRecurring: false`).

---

## File Structure

- **Modify** `prisma/schema.prisma` — add `Habit`, `HabitOccurrence` models and a `habits Habit[]` relation on `Profile`.
- **Create** `lib/habits/habitRecurrence.ts` + `lib/habits/habitRecurrence.test.ts` — pure recurrence-date math, one clear responsibility, fully unit tested.
- **Create** `lib/habits/materialize.ts` — thin Supabase I/O wrapper around the pure recurrence math; not unit tested (no DB in test env), covered by manual verification.
- **Create** `lib/ai/validateHabitClassification.ts` + `.test.ts` — pure validation of the AI JSON response, split out so it's testable without mocking the OpenAI client (no AI route in this codebase has a unit test today — this keeps the testable logic outside the route).
- **Modify** `lib/ai/modelConfig.ts` — register the `classify-habit` AI feature slot.
- **Create** `app/api/ai/classify-habit/route.ts` — the intent-classification endpoint.
- **Create** `app/api/habits/route.ts` — `POST` to create a habit (+ initial occurrence materialization).
- **Create** `app/api/habits/occurrences/[id]/route.ts` — `PATCH` to toggle an occurrence's `completed` state.
- **Modify** `lib/myday/types.ts` — add `MyDayHabitOccurrence` and a `habits` field on `MyDayData`.
- **Modify** `lib/myday/day.ts` — materialize + include due habit occurrences in `getMyDayForDate`.
- **Create** `components/myday/HabitsChecklist.tsx` — renders today's habit occurrences with a checkbox, colored by `sourceApp`.
- **Create** `components/myday/HabitCreateSheet.tsx` — the 3-step capture/confirm/recurrence modal.
- **Modify** `app/(logbook)/logbook/myday/_components/MyDayClient.tsx` — FAB becomes a `RadialMenu` with "Block" and "Habit" options; render `HabitsChecklist` and `HabitCreateSheet`.

---

### Task 1: Data model — `Habit` and `HabitOccurrence`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Postgres tables `habits` (columns: `id, profileId, title, sourceApp, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate, isActive, createdAt`) and `habit_occurrences` (columns: `id, habitId, date, completed, completedAt, createdAt`), queried via `supabase.from('habits')` / `supabase.from('habit_occurrences')` by every later task.

- [ ] **Step 1: Add the `Habit` and `HabitOccurrence` models**

In `prisma/schema.prisma`, find the `HouseholdChore`/`HouseholdChoreInstance` models (~line 1185) and add the new models directly after `HouseholdChoreInstance`'s closing brace:

```prisma
/// a user-defined habit, one-time or recurring, optionally routed to an app by AI intent classification
model Habit {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile        Profile  @relation(fields: [profileId], references: [id])
  profileId      String   @db.Uuid
  title          String
  sourceApp      String? // AppId (e.g. 'burnlog' | 'travellog' | 'tasklog' | 'homelog' | ...); null = generic/unassigned
  recurrenceType String // 'once' | 'daily' | 'weekly'
  daysOfWeek     Int[]    @default([]) // 0=Sun..6=Sat; used when recurrenceType = 'weekly'
  intervalWeeks  Int      @default(1) // "every N weeks"; used when recurrenceType = 'weekly'
  endType        String   @default("never") // 'never' | 'on_date' | 'after_n'
  endDate        DateTime? @db.Date // used when endType = 'on_date'
  endCount       Int? // used when endType = 'after_n'
  startDate      DateTime @db.Date
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  occurrences    HabitOccurrence[]

  @@index([profileId])
  @@map("habits")
}

/// a single materialized due-date for a habit — completion persists per-occurrence
model HabitOccurrence {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  habit       Habit     @relation(fields: [habitId], references: [id], onDelete: Cascade)
  habitId     String    @db.Uuid
  date        DateTime  @db.Date
  completed   Boolean   @default(false)
  completedAt DateTime?
  createdAt   DateTime  @default(now())

  @@unique([habitId, date])
  @@index([date])
  @@map("habit_occurrences")
}
```

- [ ] **Step 2: Add the inverse relation on `Profile`**

Find the `Profile` model's other one-to-many relation fields (e.g. `choresAssigned HouseholdChoreInstance[] @relation("ChoreAssigned")` around line 92) and add a new line directly after them:

```prisma
  habits              Habit[]
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_habits`
Expected: a new folder under `prisma/migrations/` containing `migration.sql` with `CREATE TABLE "habits" (...)` and `CREATE TABLE "habit_occurrences" (...)`, applied to your local database without errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(habits): add Habit and HabitOccurrence data model"
```

---

### Task 2: Recurrence date math (pure, TDD)

**Files:**
- Create: `lib/habits/habitRecurrence.ts`
- Create: `lib/habits/habitRecurrence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HabitRecurrenceType = 'once' | 'daily' | 'weekly';
  export type HabitEndType = 'never' | 'on_date' | 'after_n';

  export interface HabitRecurrenceFields {
    recurrenceType: HabitRecurrenceType;
    daysOfWeek: number[];       // 0=Sun..6=Sat, only used when recurrenceType === 'weekly'
    intervalWeeks: number;      // only used when recurrenceType === 'weekly', >= 1
    endType: HabitEndType;
    endDate: string | null;     // 'yyyy-MM-dd', used when endType === 'on_date'
    endCount: number | null;    // used when endType === 'after_n'
    startDate: string;          // 'yyyy-MM-dd'
  }

  export function computeOccurrenceDates(
    habit: HabitRecurrenceFields,
    rangeStart: string, // 'yyyy-MM-dd'
    rangeEnd: string    // 'yyyy-MM-dd', inclusive
  ): string[]; // ascending 'yyyy-MM-dd' dates within [rangeStart, rangeEnd]

  export function computeMissingOccurrences(
    habit: HabitRecurrenceFields,
    existingDates: string[],
    rangeStart: string,
    rangeEnd: string
  ): string[];
  ```
  Both are consumed by `lib/habits/materialize.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `lib/habits/habitRecurrence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeOccurrenceDates, computeMissingOccurrences, type HabitRecurrenceFields } from './habitRecurrence';

function habit(overrides: Partial<HabitRecurrenceFields>): HabitRecurrenceFields {
  return {
    recurrenceType: 'once',
    daysOfWeek: [],
    intervalWeeks: 1,
    endType: 'never',
    endDate: null,
    endCount: null,
    startDate: '2026-09-08',
    ...overrides,
  };
}

describe('computeOccurrenceDates', () => {
  it('returns the single start date for a one-time habit within range', () => {
    const h = habit({ recurrenceType: 'once', startDate: '2026-09-10' });
    expect(computeOccurrenceDates(h, '2026-09-01', '2026-09-30')).toEqual(['2026-09-10']);
  });

  it('excludes a one-time habit whose date falls outside the range', () => {
    const h = habit({ recurrenceType: 'once', startDate: '2026-10-01' });
    expect(computeOccurrenceDates(h, '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('returns every date for a daily habit within range', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08' });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-10')).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('returns only the selected weekdays for a weekly Mon-Fri habit', () => {
    // 2026-09-08 is a Tuesday
    const h = habit({ recurrenceType: 'weekly', startDate: '2026-09-08', daysOfWeek: [1, 2, 3, 4, 5] });
    const dates = computeOccurrenceDates(h, '2026-09-08', '2026-09-14');
    expect(dates).toEqual(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('honors an every-N-weeks interval', () => {
    // 2026-09-07 is a Monday. Every 2 weeks on Monday.
    const h = habit({ recurrenceType: 'weekly', startDate: '2026-09-07', daysOfWeek: [1], intervalWeeks: 2 });
    const dates = computeOccurrenceDates(h, '2026-09-07', '2026-10-05');
    expect(dates).toEqual(['2026-09-07', '2026-09-21', '2026-10-05']);
  });

  it('stops at an on_date end condition', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08', endType: 'on_date', endDate: '2026-09-10' });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-30')).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('stops after N occurrences with an after_n end condition', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08', endType: 'after_n', endCount: 2 });
    expect(computeOccurrenceDates(h, '2026-09-08', '2026-09-30')).toEqual(['2026-09-08', '2026-09-09']);
  });
});

describe('computeMissingOccurrences', () => {
  it('filters out dates already present', () => {
    const h = habit({ recurrenceType: 'daily', startDate: '2026-09-08' });
    const missing = computeMissingOccurrences(h, ['2026-09-08', '2026-09-09'], '2026-09-08', '2026-09-10');
    expect(missing).toEqual(['2026-09-10']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/habits/habitRecurrence.test.ts`
Expected: FAIL — `Cannot find module './habitRecurrence'`.

- [ ] **Step 3: Implement `lib/habits/habitRecurrence.ts`**

```ts
// lib/habits/habitRecurrence.ts
//
// Pure date math for habit recurrence: given a habit's recurrence fields
// and a date range, computes which 'yyyy-MM-dd' dates the habit is due on.
// No I/O — see lib/habits/materialize.ts for the Supabase-backed wrapper
// that uses these to top up HabitOccurrence rows.

import { addDays, format, isAfter, isBefore, parseISO } from 'date-fns';

export type HabitRecurrenceType = 'once' | 'daily' | 'weekly';
export type HabitEndType = 'never' | 'on_date' | 'after_n';

export interface HabitRecurrenceFields {
  recurrenceType: HabitRecurrenceType;
  daysOfWeek: number[];
  intervalWeeks: number;
  endType: HabitEndType;
  endDate: string | null;
  endCount: number | null;
  startDate: string;
}

// Safety cap on the day-by-day scan below, so a pathological input (e.g. a
// daily habit with no end condition queried against a huge range) can't
// spin forever. ~10 years of daily iteration is far beyond any real range
// this module is ever called with (materialize.ts caps ranges to ~60 days).
const MAX_ITERATIONS = 3660;

function toDate(iso: string): Date {
  return parseISO(iso);
}

function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDueOnWeekly(habit: HabitRecurrenceFields, start: Date, cursor: Date): boolean {
  if (!habit.daysOfWeek.includes(cursor.getDay())) return false;
  if (habit.intervalWeeks <= 1) return true;
  const weeksSinceStart = Math.round(
    (startOfWeek(cursor).getTime() - startOfWeek(start).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weeksSinceStart % habit.intervalWeeks === 0;
}

export function computeOccurrenceDates(habit: HabitRecurrenceFields, rangeStart: string, rangeEnd: string): string[] {
  const start = toDate(habit.startDate);
  const rangeStartDate = toDate(rangeStart);
  const rangeEndDate = toDate(rangeEnd);
  const hardEndDate = habit.endType === 'on_date' && habit.endDate ? toDate(habit.endDate) : null;

  if (habit.recurrenceType === 'once') {
    if (isBefore(start, rangeStartDate) || isAfter(start, rangeEndDate)) return [];
    if (hardEndDate && isAfter(start, hardEndDate)) return [];
    return [toISO(start)];
  }

  const results: string[] = [];
  let occurrenceCount = 0;
  let cursor = start;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (isAfter(cursor, rangeEndDate)) break;
    if (hardEndDate && isAfter(cursor, hardEndDate)) break;

    const isDue = habit.recurrenceType === 'daily' || isDueOnWeekly(habit, start, cursor);

    if (isDue) {
      occurrenceCount += 1;
      if (habit.endType === 'after_n' && habit.endCount !== null && occurrenceCount > habit.endCount) {
        break;
      }
      if (!isBefore(cursor, rangeStartDate)) {
        results.push(toISO(cursor));
      }
    }

    cursor = addDays(cursor, 1);
  }

  return results;
}

export function computeMissingOccurrences(
  habit: HabitRecurrenceFields,
  existingDates: string[],
  rangeStart: string,
  rangeEnd: string
): string[] {
  const existing = new Set(existingDates);
  return computeOccurrenceDates(habit, rangeStart, rangeEnd).filter((date) => !existing.has(date));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/habits/habitRecurrence.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/habits/habitRecurrence.ts lib/habits/habitRecurrence.test.ts
git commit -m "feat(habits): add pure recurrence date-math module"
```

---

### Task 3: AI classification response validation (pure, TDD)

**Files:**
- Create: `lib/ai/validateHabitClassification.ts`
- Create: `lib/ai/validateHabitClassification.test.ts`

**Interfaces:**
- Consumes: nothing beyond `AppId` from `lib/appMode.ts`.
- Produces:
  ```ts
  export interface HabitClassification {
    title: string;
    sourceApp: AppId | null;
    isRecurring: boolean;
    suggestedRecurrence?: { daysOfWeek?: number[]; intervalWeeks?: number };
  }

  export function validateHabitClassification(
    parsed: unknown,
    validAppIds: readonly string[]
  ): HabitClassification; // throws Error on any invalid shape
  ```
  Consumed by `app/api/ai/classify-habit/route.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/validateHabitClassification.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateHabitClassification } from './validateHabitClassification';

const APP_IDS = ['burnlog', 'travellog', 'tasklog', 'homelog'];

describe('validateHabitClassification', () => {
  it('accepts a fully-populated valid response', () => {
    const result = validateHabitClassification(
      {
        title: 'Drink water',
        sourceApp: 'burnlog',
        isRecurring: true,
        suggestedRecurrence: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1 },
      },
      APP_IDS
    );
    expect(result).toEqual({
      title: 'Drink water',
      sourceApp: 'burnlog',
      isRecurring: true,
      suggestedRecurrence: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1 },
    });
  });

  it('accepts sourceApp: null', () => {
    const result = validateHabitClassification({ title: 'Read a book', sourceApp: null, isRecurring: false }, APP_IDS);
    expect(result.sourceApp).toBeNull();
  });

  it('accepts a response with no suggestedRecurrence', () => {
    const result = validateHabitClassification({ title: 'Pack bags', sourceApp: 'travellog', isRecurring: false }, APP_IDS);
    expect(result.suggestedRecurrence).toBeUndefined();
  });

  it('rejects a missing title', () => {
    expect(() => validateHabitClassification({ sourceApp: null, isRecurring: false }, APP_IDS)).toThrow();
  });

  it('rejects a sourceApp not in the roster', () => {
    expect(() =>
      validateHabitClassification({ title: 'x', sourceApp: 'not-a-real-app', isRecurring: false }, APP_IDS)
    ).toThrow();
  });

  it('rejects a non-boolean isRecurring', () => {
    expect(() =>
      validateHabitClassification({ title: 'x', sourceApp: null, isRecurring: 'yes' }, APP_IDS)
    ).toThrow();
  });

  it('rejects an invalid daysOfWeek entry', () => {
    expect(() =>
      validateHabitClassification(
        { title: 'x', sourceApp: null, isRecurring: true, suggestedRecurrence: { daysOfWeek: [0, 9] } },
        APP_IDS
      )
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai/validateHabitClassification.test.ts`
Expected: FAIL — `Cannot find module './validateHabitClassification'`.

- [ ] **Step 3: Implement `lib/ai/validateHabitClassification.ts`**

```ts
// lib/ai/validateHabitClassification.ts
//
// Validates the JSON shape returned by POST /api/ai/classify-habit's model
// call, split out from the route so it's unit-testable without mocking the
// OpenAI client (no AI route in this codebase has a route-level test today).

import type { AppId } from '@/lib/appMode';

export interface HabitClassification {
  title: string;
  sourceApp: AppId | null;
  isRecurring: boolean;
  suggestedRecurrence?: {
    daysOfWeek?: number[];
    intervalWeeks?: number;
  };
}

export function validateHabitClassification(parsed: unknown, validAppIds: readonly string[]): HabitClassification {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI response was not a JSON object');
  }
  const result = parsed as Record<string, unknown>;

  if (typeof result.title !== 'string' || !result.title.trim()) {
    throw new Error('AI response had an invalid title');
  }

  const sourceAppRaw = result.sourceApp;
  if (sourceAppRaw !== null && (typeof sourceAppRaw !== 'string' || !validAppIds.includes(sourceAppRaw))) {
    throw new Error('AI response had an invalid sourceApp');
  }

  if (typeof result.isRecurring !== 'boolean') {
    throw new Error('AI response had an invalid isRecurring flag');
  }

  let suggestedRecurrence: HabitClassification['suggestedRecurrence'];
  if (result.suggestedRecurrence !== undefined) {
    if (typeof result.suggestedRecurrence !== 'object' || result.suggestedRecurrence === null) {
      throw new Error('AI response had an invalid suggestedRecurrence');
    }
    const raw = result.suggestedRecurrence as Record<string, unknown>;
    suggestedRecurrence = {};

    if (raw.daysOfWeek !== undefined) {
      const valid = Array.isArray(raw.daysOfWeek) && raw.daysOfWeek.every((d) => typeof d === 'number' && d >= 0 && d <= 6);
      if (!valid) throw new Error('AI response had an invalid suggestedRecurrence.daysOfWeek');
      suggestedRecurrence.daysOfWeek = raw.daysOfWeek as number[];
    }

    if (raw.intervalWeeks !== undefined) {
      if (typeof raw.intervalWeeks !== 'number' || raw.intervalWeeks < 1) {
        throw new Error('AI response had an invalid suggestedRecurrence.intervalWeeks');
      }
      suggestedRecurrence.intervalWeeks = raw.intervalWeeks;
    }
  }

  return {
    title: result.title.trim(),
    sourceApp: (sourceAppRaw ?? null) as AppId | null,
    isRecurring: result.isRecurring,
    suggestedRecurrence,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/validateHabitClassification.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/validateHabitClassification.ts lib/ai/validateHabitClassification.test.ts
git commit -m "feat(habits): add AI classification response validator"
```

---

### Task 4: Occurrence materialization (Supabase I/O wrapper)

**Files:**
- Create: `lib/habits/materialize.ts`

**Interfaces:**
- Consumes: `computeMissingOccurrences`, `HabitRecurrenceFields` from `lib/habits/habitRecurrence.ts` (Task 2).
- Produces: `ensureHabitOccurrences(supabase: SupabaseClient, profileId: string, throughDate: string): Promise<void>`, consumed by `app/api/habits/route.ts` (Task 6) and `lib/myday/day.ts` (Task 7).

- [ ] **Step 1: Implement `lib/habits/materialize.ts`**

```ts
// lib/habits/materialize.ts
//
// Tops up HabitOccurrence rows for a profile's active habits so the window
// [today, throughDate + WINDOW_DAYS] is fully covered. Idempotent: safe to
// call on every habit creation and on every My Day read — it only inserts
// dates a habit doesn't already have a row for, so re-running never
// duplicates (also enforced by the @@unique([habitId, date]) constraint).

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { computeMissingOccurrences, type HabitRecurrenceFields } from './habitRecurrence';

const WINDOW_DAYS = 60;

interface HabitRow extends HabitRecurrenceFields {
  id: string;
}

export async function ensureHabitOccurrences(
  supabase: SupabaseClient,
  profileId: string,
  throughDate: string
): Promise<void> {
  const rangeStart = format(new Date(), 'yyyy-MM-dd');
  const rangeEnd = format(addDays(new Date(`${throughDate}T00:00:00`), WINDOW_DAYS), 'yyyy-MM-dd');

  const { data: habits } = await supabase
    .from('habits')
    .select('id, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate')
    .eq('profileId', profileId)
    .eq('isActive', true);

  for (const habit of (habits as HabitRow[]) || []) {
    const { data: existing } = await supabase
      .from('habit_occurrences')
      .select('date')
      .eq('habitId', habit.id)
      .gte('date', rangeStart)
      .lte('date', rangeEnd);

    const existingDates = ((existing as { date: string }[]) || []).map((row) => row.date);
    const missing = computeMissingOccurrences(habit, existingDates, rangeStart, rangeEnd);
    if (missing.length === 0) continue;

    await supabase.from('habit_occurrences').insert(missing.map((date) => ({ habitId: habit.id, date })));
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `lib/habits/materialize.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/habits/materialize.ts
git commit -m "feat(habits): add occurrence materialization"
```

---

### Task 5: Register the `classify-habit` AI feature

**Files:**
- Modify: `lib/ai/modelConfig.ts`

**Interfaces:**
- Produces: a `getModel(supabase, 'classify-habit')`-resolvable slot, consumed by `app/api/ai/classify-habit/route.ts` (Task 6).

- [ ] **Step 1: Add the feature entry**

In `lib/ai/modelConfig.ts`, add a new element to the `AI_FEATURES` array (any position; appended at the end here):

```ts
  { slot: 'classify-habit', label: 'Classify Habit', description: 'Route a freeform habit description to an app and suggest recurrence.', app: 'logbook', kind: 'text' },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/modelConfig.ts
git commit -m "feat(habits): register classify-habit AI feature slot"
```

---

### Task 6: `POST /api/ai/classify-habit`

**Files:**
- Create: `app/api/ai/classify-habit/route.ts`

**Interfaces:**
- Consumes: `validateHabitClassification` (Task 3), `APPS`/`AppId` from `lib/appMode.ts`, `getModel` (Task 5's slot).
- Produces: `POST` endpoint returning `HabitClassification` JSON, consumed by `components/myday/HabitCreateSheet.tsx` (Task 10).

- [ ] **Step 1: Implement the route**

```ts
// app/api/ai/classify-habit/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { APPS, type AppId } from '@/lib/appMode';
import { validateHabitClassification } from '@/lib/ai/validateHabitClassification';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    MODEL = await getModel(supabase, 'classify-habit');

    const body = await request.json();
    const { text } = body as { text?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const appRoster = (Object.keys(APPS) as AppId[])
      .filter((id) => id !== 'logbook' && id !== 'adminlog')
      .map((id) => `- ${id}: ${APPS[id].tagline}`)
      .join('\n');

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'classify-habit', app: 'logbook', model: MODEL },
        { text },
        async (signal) => {
          const prompt = `A user wants to build a habit and described it in their own words.

Habit description: "${text.trim()}"

Available apps this habit could belong to:
${appRoster}

Task:
1. Write a short, clean "title" for this habit (a few words).
2. Pick the single best-fitting "sourceApp" id from the list above, or null if none clearly fits.
3. Decide "isRecurring": true if the description implies a repeated habit (e.g. "every day", "each morning"), false if it sounds one-time.
4. If recurring, optionally suggest "suggestedRecurrence": { "daysOfWeek": number[] (0=Sun..6=Sat), "intervalWeeks": number }. Omit fields you're not confident about.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "title": string,
  "sourceApp": string | null,
  "isRecurring": boolean,
  "suggestedRecurrence"?: { "daysOfWeek"?: number[], "intervalWeeks"?: number }
}`;

          const completion = await client.chat.completions.create(
            {
              model: MODEL,
              temperature: 0.2,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
            },
            { signal }
          );

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          try {
            return validateHabitClassification(parsed, Object.keys(APPS));
          } catch (err) {
            throw new AiRouteError(err instanceof Error ? err.message : 'AI response was invalid', 502);
          }
        }
      );

      return NextResponse.json(responsePayload);
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('classify-habit error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`), sign in, and `curl` (with your session cookie, or via the browser devtools network tab while testing Task 10's UI) `POST /api/ai/classify-habit` with `{"text": "drink 2 liters of water every day"}`. Expected: a 200 response shaped like `{"title": "...", "sourceApp": "burnlog" | null, "isRecurring": true, "suggestedRecurrence": {...}}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/classify-habit/route.ts
git commit -m "feat(habits): add classify-habit AI intent route"
```

---

### Task 7: `POST /api/habits`

**Files:**
- Create: `app/api/habits/route.ts`

**Interfaces:**
- Consumes: `ensureHabitOccurrences` (Task 4), `HabitRecurrenceType`/`HabitEndType` (Task 2).
- Produces: `POST` endpoint accepting `{ title, sourceApp, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate }`, returning `{ id: string }`. Consumed by `components/myday/HabitCreateSheet.tsx` (Task 10).

- [ ] **Step 1: Implement the route**

```ts
// app/api/habits/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { ensureHabitOccurrences } from '@/lib/habits/materialize';
import type { HabitEndType, HabitRecurrenceType } from '@/lib/habits/habitRecurrence';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, sourceApp, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate } =
      body as {
        title?: string;
        sourceApp?: string | null;
        recurrenceType?: HabitRecurrenceType;
        daysOfWeek?: number[];
        intervalWeeks?: number;
        endType?: HabitEndType;
        endDate?: string | null;
        endCount?: number | null;
        startDate?: string;
      };

    if (!title?.trim() || !recurrenceType || !startDate) {
      return NextResponse.json({ error: 'title, recurrenceType, and startDate are required' }, { status: 400 });
    }

    const { data: habit, error } = await admin
      .from('habits')
      .insert([
        {
          profileId,
          title: title.trim(),
          sourceApp: sourceApp ?? null,
          recurrenceType,
          daysOfWeek: daysOfWeek ?? [],
          intervalWeeks: intervalWeeks ?? 1,
          endType: endType ?? 'never',
          endDate: endDate ?? null,
          endCount: endCount ?? null,
          startDate,
        },
      ])
      .select('id')
      .single();

    if (error) throw error;

    await ensureHabitOccurrences(admin, profileId, startDate);

    return NextResponse.json({ id: habit.id }, { status: 201 });
  } catch (error) {
    console.error('habits post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

With the dev server running and signed in, `POST /api/habits` with a body like `{"title":"Drink water","sourceApp":"burnlog","recurrenceType":"weekly","daysOfWeek":[1,2,3,4,5],"intervalWeeks":1,"endType":"never","startDate":"2026-09-08"}`. Expected: `201` with `{ id }`, and rows visible in both `habits` and `habit_occurrences` (via Supabase table editor or `select * from habit_occurrences where "habitId" = '<id>'`) for the upcoming weekdays.

- [ ] **Step 4: Commit**

```bash
git add app/api/habits/route.ts
git commit -m "feat(habits): add habit creation route"
```

---

### Task 8: `PATCH /api/habits/occurrences/[id]`

**Files:**
- Create: `app/api/habits/occurrences/[id]/route.ts`

**Interfaces:**
- Produces: `PATCH` endpoint accepting `{ completed: boolean }`, returning `{ ok: true }`. Consumed by `components/myday/HabitsChecklist.tsx` via `MyDayClient` (Task 11).

- [ ] **Step 1: Implement the route**

```ts
// app/api/habits/occurrences/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { completed } = body as { completed?: boolean };
    if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'completed (boolean) is required' }, { status: 400 });
    }

    const { data: occurrence } = await admin.from('habit_occurrences').select('id, habitId').eq('id', id).single();
    if (!occurrence) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: habit } = await admin
      .from('habits')
      .select('id')
      .eq('id', occurrence.habitId)
      .eq('profileId', profileId)
      .single();
    if (!habit) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await admin
      .from('habit_occurrences')
      .update({ completed, completedAt: completed ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('habit occurrence patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/habits/occurrences/[id]/route.ts
git commit -m "feat(habits): add habit occurrence completion route"
```

---

### Task 9: My Day integration — types and data

**Files:**
- Modify: `lib/myday/types.ts`
- Modify: `lib/myday/day.ts`

**Interfaces:**
- Consumes: `ensureHabitOccurrences` (Task 4).
- Produces:
  ```ts
  export interface MyDayHabitOccurrence {
    id: string;
    habitId: string;
    title: string;
    sourceApp: string | null; // AppId | null
    completed: boolean;
  }
  // MyDayData gains: habits: MyDayHabitOccurrence[]
  ```
  Consumed by `components/myday/HabitsChecklist.tsx` and `MyDayClient.tsx` (Tasks 10-11).

- [ ] **Step 1: Add `MyDayHabitOccurrence` and extend `MyDayData`**

In `lib/myday/types.ts`, add:

```ts
export interface MyDayHabitOccurrence {
  id: string;
  habitId: string;
  title: string;
  sourceApp: string | null; // AppId | null
  completed: boolean;
}
```

Then change:

```ts
export interface MyDayData {
  date: string; // 'yyyy-MM-dd'
  blocks: MyDayBlock[];
  unscheduled: MyDayUnscheduledItem[];
}
```

to:

```ts
export interface MyDayData {
  date: string; // 'yyyy-MM-dd'
  blocks: MyDayBlock[];
  unscheduled: MyDayUnscheduledItem[];
  habits: MyDayHabitOccurrence[];
}
```

- [ ] **Step 2: Materialize and include due habit occurrences in `getMyDayForDate`**

In `lib/myday/day.ts`, add the import:

```ts
import { ensureHabitOccurrences } from '@/lib/habits/materialize';
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem, MyDayHabitOccurrence } from './types';
```

(replacing the existing `import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from './types';` line).

At the start of `getMyDayForDate`'s body (before the existing `blockRows` query), add:

```ts
  await ensureHabitOccurrences(supabase, profileId, date);
```

Immediately before the `return { date, blocks, unscheduled };` line at the end of the function, add:

```ts
  const { data: profileHabits } = await supabase
    .from('habits')
    .select('id, title, sourceApp')
    .eq('profileId', profileId)
    .eq('isActive', true);

  const habitById = new Map(
    ((profileHabits as { id: string; title: string; sourceApp: string | null }[]) || []).map((h) => [h.id, h])
  );

  let habits: MyDayHabitOccurrence[] = [];
  if (habitById.size > 0) {
    const { data: habitOccurrenceRows } = await supabase
      .from('habit_occurrences')
      .select('id, habitId, completed')
      .eq('date', date)
      .in('habitId', Array.from(habitById.keys()));

    habits = ((habitOccurrenceRows as { id: string; habitId: string; completed: boolean }[]) || [])
      .map((row) => {
        const habit = habitById.get(row.habitId);
        if (!habit) return null;
        return { id: row.id, habitId: row.habitId, title: habit.title, sourceApp: habit.sourceApp, completed: row.completed };
      })
      .filter((h): h is MyDayHabitOccurrence => h !== null);
  }
```

Then change the final `return { date, blocks, unscheduled };` to `return { date, blocks, unscheduled, habits };`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this will surface any other place that constructs a `MyDayData` literal without `habits` — there should be none besides `getMyDayForDate`, but fix any that appear by adding `habits: []`).

- [ ] **Step 4: Commit**

```bash
git add lib/myday/types.ts lib/myday/day.ts
git commit -m "feat(habits): surface due habit occurrences in My Day data"
```

---

### Task 10: `HabitsChecklist` component

**Files:**
- Create: `components/myday/HabitsChecklist.tsx`

**Interfaces:**
- Consumes: `MyDayHabitOccurrence` (Task 9), `useAppThemeColors` (`lib/theme/useAppThemeColors.ts`), `AppId` (`lib/appMode.ts`).
- Produces: `HabitsChecklist({ habits, onToggle }: { habits: MyDayHabitOccurrence[]; onToggle: (habit: MyDayHabitOccurrence, completed: boolean) => void })`, consumed by `MyDayClient.tsx` (Task 12).

- [ ] **Step 1: Implement the component**

```tsx
// components/myday/HabitsChecklist.tsx
'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';
import type { MyDayHabitOccurrence } from '@/lib/myday/types';
import type { AppId } from '@/lib/appMode';

interface HabitsChecklistProps {
  habits: MyDayHabitOccurrence[];
  onToggle: (habit: MyDayHabitOccurrence, completed: boolean) => void;
}

export function HabitsChecklist({ habits, onToggle }: HabitsChecklistProps) {
  const { colorFor } = useAppThemeColors();
  if (habits.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {habits.map((habit) => {
        const color = colorFor((habit.sourceApp as AppId | null) ?? 'logbook');
        return (
          <button
            key={habit.id}
            type="button"
            onClick={() => onToggle(habit, !habit.completed)}
            className="flex items-center gap-2 rounded-lg border bg-background p-3 text-left text-sm"
            style={{ borderLeftColor: color, borderLeftWidth: 4 }}
          >
            {habit.completed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className={habit.completed ? 'text-muted-foreground line-through' : ''}>{habit.title}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/myday/HabitsChecklist.tsx
git commit -m "feat(habits): add HabitsChecklist component"
```

---

### Task 11: `HabitCreateSheet` component (capture → confirm → recurrence)

**Files:**
- Create: `components/myday/HabitCreateSheet.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/classify-habit` (Task 6), `POST /api/habits` (Task 7), `APPS`/`AppId` (`lib/appMode.ts`), `HabitEndType`/`HabitRecurrenceType` (Task 2), `SiriOrb` (`components/smoothui/siri-orb`), `Button` (`components/ui/button`).
- Produces: `HabitCreateSheet({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void })`, consumed by `MyDayClient.tsx` (Task 12).

- [ ] **Step 1: Implement the component**

```tsx
// components/myday/HabitCreateSheet.tsx
'use client';

import { useState } from 'react';
import SiriOrb from '@/components/smoothui/siri-orb';
import { Button } from '@/components/ui/button';
import { APPS, type AppId } from '@/lib/appMode';
import type { HabitEndType, HabitRecurrenceType } from '@/lib/habits/habitRecurrence';

interface HabitCreateSheetProps {
  date: string;
  onClose: () => void;
  onSaved: () => void;
}

interface ClassifyResult {
  title: string;
  sourceApp: AppId | null;
  isRecurring: boolean;
  suggestedRecurrence?: { daysOfWeek?: number[]; intervalWeeks?: number };
}

type Step =
  | { step: 'capture' }
  | { step: 'confirm'; result: ClassifyResult }
  | { step: 'recurrence'; result: ClassifyResult };

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_PRESET = [1, 2, 3, 4, 5]; // Mon-Fri

export function HabitCreateSheet({ date, onClose, onSaved }: HabitCreateSheetProps) {
  const [state, setState] = useState<Step>({ step: 'capture' });
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);

  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(WEEKDAY_PRESET);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endType, setEndType] = useState<HabitEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [endCount, setEndCount] = useState(10);

  async function handleCapture() {
    if (!text.trim()) return;
    setThinking(true);
    try {
      const res = await fetch('/api/ai/classify-habit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const result: ClassifyResult = res.ok
        ? await res.json()
        : { title: text.trim(), sourceApp: null, isRecurring: false };
      if (result.suggestedRecurrence?.daysOfWeek) setDaysOfWeek(result.suggestedRecurrence.daysOfWeek);
      if (result.suggestedRecurrence?.intervalWeeks) setIntervalWeeks(result.suggestedRecurrence.intervalWeeks);
      setState({ step: 'confirm', result });
    } catch {
      setState({ step: 'confirm', result: { title: text.trim(), sourceApp: null, isRecurring: false } });
    } finally {
      setThinking(false);
    }
  }

  async function handleCreate(result: ClassifyResult, recurrenceType: HabitRecurrenceType) {
    setSaving(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.title,
          sourceApp: result.sourceApp,
          recurrenceType,
          daysOfWeek: recurrenceType === 'weekly' ? daysOfWeek : [],
          intervalWeeks,
          endType: recurrenceType === 'weekly' ? endType : 'never',
          endDate: recurrenceType === 'weekly' && endType === 'on_date' ? endDate : null,
          endCount: recurrenceType === 'weekly' && endType === 'after_n' ? endCount : null,
          startDate: date,
        }),
      });
      if (!res.ok) throw new Error('Failed to create habit');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        {state.step === 'capture' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <SiriOrb state={thinking ? 'thinking' : 'idle'} size={72} />
            <textarea
              className="w-full rounded-lg border p-3 text-sm"
              placeholder="What habit do you want to build?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
            <Button onClick={handleCapture} disabled={thinking || !text.trim()} className="w-full">
              {thinking ? 'Thinking…' : 'Continue'}
            </Button>
          </div>
        )}

        {state.step === 'confirm' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold">{state.result.title}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(APPS) as AppId[]).map((appId) => (
                <button
                  key={appId}
                  type="button"
                  onClick={() => setState({ step: 'confirm', result: { ...state.result, sourceApp: appId } })}
                  className={`rounded-full border px-3 py-1 text-xs ${state.result.sourceApp === appId ? 'border-foreground' : ''}`}
                >
                  {APPS[appId].name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setState({ step: 'confirm', result: { ...state.result, sourceApp: null } })}
                className={`rounded-full border px-3 py-1 text-xs ${state.result.sourceApp === null ? 'border-foreground' : ''}`}
              >
                General
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleCreate(state.result, 'once')} disabled={saving} className="flex-1">
                One-time
              </Button>
              <Button onClick={() => setState({ step: 'recurrence', result: state.result })} className="flex-1">
                Recurring
              </Button>
            </div>
          </div>
        )}

        {state.step === 'recurrence' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Repeat on</p>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-9 w-9 rounded-full border text-xs ${daysOfWeek.includes(day) ? 'bg-foreground text-background' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" className="self-start text-xs underline" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}>
                  Every day
                </button>
                <button type="button" className="self-start text-xs underline" onClick={() => setDaysOfWeek(WEEKDAY_PRESET)}>
                  Weekdays
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              Every
              <input
                type="number"
                min={1}
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Math.max(1, Number(e.target.value)))}
                className="w-14 rounded border p-1 text-center"
              />
              week(s)
            </label>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Ends</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'never'} onChange={() => setEndType('never')} /> Never
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'on_date'} onChange={() => setEndType('on_date')} /> On date
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'after_n'} onChange={() => setEndType('after_n')} /> After N times
                </label>
              </div>
              {endType === 'on_date' && (
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border p-1 text-sm" />
              )}
              {endType === 'after_n' && (
                <input
                  type="number"
                  min={1}
                  value={endCount}
                  onChange={(e) => setEndCount(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded border p-1 text-sm"
                />
              )}
            </div>

            <Button onClick={() => handleCreate(state.result, 'weekly')} disabled={saving || daysOfWeek.length === 0} className="w-full">
              {saving ? 'Creating…' : 'Create habit'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check `SiriOrb`'s prop name for size**

Run: `grep -n "size" components/smoothui/siri-orb/index.tsx | head -5`
Confirm the prop accepting a pixel size (used above as `size={72}`); if the actual prop is named differently, adjust the `<SiriOrb .../>` call to match.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/myday/HabitCreateSheet.tsx
git commit -m "feat(habits): add HabitCreateSheet capture/confirm/recurrence flow"
```

---

### Task 12: Wire into `MyDayClient`

**Files:**
- Modify: `app/(logbook)/logbook/myday/_components/MyDayClient.tsx`

**Interfaces:**
- Consumes: `HabitsChecklist` (Task 10), `HabitCreateSheet` (Task 11), `RadialMenu`/`RadialMenuItem` (`components/kokonutui/radial-menu.tsx`), `PATCH /api/habits/occurrences/[id]` (Task 8).

- [ ] **Step 1: Add imports**

At the top of `MyDayClient.tsx`, add:

```ts
import { CalendarClock } from 'lucide-react';
import { RadialMenu, type RadialMenuItem } from '@/components/kokonutui/radial-menu';
import { HabitsChecklist } from '@/components/myday/HabitsChecklist';
import { HabitCreateSheet } from '@/components/myday/HabitCreateSheet';
import type { MyDayHabitOccurrence } from '@/lib/myday/types';
```

(`Plus` is already imported; add `CalendarClock` alongside the existing `CalendarDays, Plus, RefreshCw` import instead of a separate line.)

- [ ] **Step 2: Extend `SheetState` and add FAB-menu state**

Change:

```ts
type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock };
```

to:

```ts
type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock }
  | { mode: 'newHabit' };
```

Inside `MyDayClient`, alongside the existing `const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });`, add:

```ts
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
```

- [ ] **Step 3: Add the habit-occurrence toggle handler**

Inside `MyDayClient`, alongside `handleSheetSaved`, add:

```ts
  async function handleToggleHabit(habit: MyDayHabitOccurrence, completed: boolean) {
    await fetch(`/api/habits/occurrences/${habit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    mutate();
  }
```

- [ ] **Step 4: Render `HabitsChecklist` under the timeline**

Change:

```tsx
        {!isLoading && data && (
          <>
            <UnscheduledTray items={data.unscheduled} onSelect={(item) => setSheet({ mode: 'fromUnscheduled', item })} />
            <DayTimeline
              blocks={data.blocks}
              onBlockClick={(block) => setSheet({ mode: 'edit', block })}
              onSlotClick={(startTime) => setSheet({ mode: 'new', startTime })}
            />
          </>
        )}
```

to:

```tsx
        {!isLoading && data && (
          <>
            <UnscheduledTray items={data.unscheduled} onSelect={(item) => setSheet({ mode: 'fromUnscheduled', item })} />
            <DayTimeline
              blocks={data.blocks}
              onBlockClick={(block) => setSheet({ mode: 'edit', block })}
              onSlotClick={(startTime) => setSheet({ mode: 'new', startTime })}
            />
            <HabitsChecklist habits={data.habits} onToggle={handleToggleHabit} />
          </>
        )}
```

- [ ] **Step 5: Replace the single-action FAB with a `RadialMenu`**

Change:

```tsx
      <ThemedButton
        slot="fab"
        onClick={() => setSheet({ mode: 'new' })}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add to your day"
      >
        <Plus className="h-6 w-6" />
      </ThemedButton>
```

to:

```tsx
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
```

- [ ] **Step 6: Render `HabitCreateSheet` for the new sheet mode**

Alongside the existing `{sheet.mode === 'edit' && ...}` block, add:

```tsx
      {sheet.mode === 'newHabit' && <HabitCreateSheet date={date} onClose={closeSheet} onSaved={handleSheetSaved} />}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open `/logbook?tab=myday`, tap the FAB — confirm both "Block" and "Habit" options appear via the radial menu. Tap "Habit", type a habit description (e.g. "go for a run every Mon/Wed/Fri"), confirm the AI-suggested app and recurrence appear, adjust if needed, and create it. Confirm it appears in the `HabitsChecklist` section colored with the assigned app's color, and that tapping its checkbox toggles completion and persists across a page reload.

- [ ] **Step 9: Commit**

```bash
git add "app/(logbook)/logbook/myday/_components/MyDayClient.tsx"
git commit -m "feat(habits): wire habit creation and checklist into My Day"
```

---

## Final Verification

- [ ] Run the full test suite: `npm run test`. Expected: all tests pass, including the new `habitRecurrence.test.ts` and `validateHabitClassification.test.ts`.
- [ ] Run `npx tsc --noEmit` one more time across the whole project. Expected: no errors.
- [ ] Repeat the Task 12 Step 8 manual walkthrough end-to-end once more, this time also testing a one-time habit and an "after N times" recurring habit, confirming occurrences stop appearing after the Nth day.
