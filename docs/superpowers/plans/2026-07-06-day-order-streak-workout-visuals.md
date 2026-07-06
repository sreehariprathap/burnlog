# Day Order Fix, Streak/Level Tracker, Workout Category Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the session day picker to Mon→Sun, add a streak/xp/level system driven by
completed workout sessions, and give each of the 6 workout categories a small custom
illustration shown on the plan card and checklist.

**Architecture:** Three independent slices sharing no code, built and committed separately.
Day-order is a pure UI reorder with zero schema/data impact. Streak/level adds four columns to
`Profile` plus a pure-function leveling module, updated inline where sessions are already
persisted (no new API route — this app has no backend CRUD layer, every write is a direct
Supabase client call from the component that needs it). Visuals are static SVG assets plus a
lookup map, rendered via `next/image`.

**Tech Stack:** Next.js 15 (App Router), Supabase JS client (direct table reads/writes from
client components — this app has no ORM-backed API layer for CRUD; Prisma is schema-only,
applied via `prisma db push`), Tailwind v4 (CSS-based config, no `tailwind.config.js`), no test
runner is configured in this repo (no jest/vitest, no existing `*.test.*` files) — verification
for pure logic uses a disposable `ts-node` script (already a project dependency, used by
`prisma/seed.js`), not a new test framework.

## Global Constraints

- `dayOfWeek` / day-index convention is `0=Sun...6=Sat` everywhere in the data layer
  (`WorkoutPlan.dayOfWeek`, `sessions.sessionData.dayIndex`, the AI prompt in
  `lib/ai/openrouter.ts`). Never change this convention — only the UI display order changes.
- No new npm dependencies for any of these three slices.
- Schema changes are applied via `npx prisma db push` (this repo has no `prisma/migrations`
  directory — confirmed by listing `./prisma`).
- All new Supabase writes/reads use `createClientComponentClient()` from
  `@supabase/auth-helpers-nextjs`, matching every existing component in `app/session/_components`
  and `app/profile/page.tsx`.
- Same-day repeat workout completions must earn 0 xp and must not change the streak (closes an
  obvious log/undo/re-log farming loop).
- `tsc --noEmit` must stay clean after every task.

---

### Task 1: Day order fix + remove dead duplicate

**Files:**
- Modify: `app/session/_components/DayNavigator.tsx`
- Delete: `app/session/_components/weeklyNavigator.tsx`

**Interfaces:**
- Consumes: nothing new. `DayNavigator`'s existing public props (`value: number`,
  `onChange: (day: number) => void`) are unchanged — `app/session/page.tsx` needs no edits.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm the dead file has no importers**

Run: `grep -rn "weeklyNavigator\|WeeklyNavigator" app --include="*.tsx" --include="*.ts"`
Expected: only `app/session/_components/weeklyNavigator.tsx` itself (its own declaration/export
line) — no import elsewhere. If anything else matches, stop and report it instead of deleting.

- [ ] **Step 2: Delete the dead file**

```bash
git rm app/session/_components/weeklyNavigator.tsx
```

- [ ] **Step 3: Rewrite `DayNavigator.tsx` to render Mon→Sun while preserving 0=Sun..6=Sat values**

Replace the full contents of `app/session/_components/DayNavigator.tsx` with:

```tsx
// components/DayNavigator.tsx
'use client';
import React from 'react';

// Values are the canonical dayOfWeek convention used everywhere else in the
// app (0=Sun...6=Sat). This array only controls *display order* (Mon first).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

type DayNavigatorProps = {
  value: number;
  onChange: (day: number) => void;
};

export function DayNavigator({ value, onChange }: DayNavigatorProps) {
  return (
    <div className="flex justify-around py-2 shadow-sm sticky top-0 z-20 gap-3 px-4 w-full">
      {DISPLAY_ORDER.map((dayOfWeek) => (
        <button
          key={dayOfWeek}
          className={`flex-1 text-center py-1 ${
            dayOfWeek === value ? 'bg-amber-500 text-white rounded' : 'dark:text-gray-200'
          }`}
          onClick={() => onChange(dayOfWeek)}
        >
          {LABELS[dayOfWeek]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/session` while logged in as a test account with at least two
`workout_plans` rows on different days. Confirm:
- The day row reads Mon, Tue, Wed, Thu, Fri, Sat, Sun left to right.
- Clicking each button loads the same plan it did before this change (cross-check one day's
  `bodyPart` against the `workout_plans` table via SQL).
- Today's day (per your system clock) is not auto-highlighted unless it matches `value`'s
  initial state (`new Date().getDay()` in `app/session/page.tsx`, unchanged) — this is existing
  behavior, just confirm it still works with the new button order.

- [ ] **Step 6: Commit**

```bash
git add app/session/_components/DayNavigator.tsx
git commit -m "$(cat <<'EOF'
Reorder session day picker to Mon-Sun display

DayNavigator kept the 0=Sun..6=Sat value convention used by workout_plans
and the AI prompt; only the button display order changed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Streak/level schema fields

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Profile.currentStreak: number`, `Profile.longestStreak: number`,
  `Profile.xp: number`, `Profile.level: number`, `Profile.lastSessionDate: string | null`
  (Postgres `date`, no time component) — consumed by Task 4 (write) and Task 5 (read/display).

- [ ] **Step 1: Add the four fields to `Profile`**

In `prisma/schema.prisma`, inside the `Profile` model, add after `isAdmin`:

```prisma
  isAdmin       Boolean  @default(false)
  currentStreak   Int       @default(0)
  longestStreak   Int       @default(0)
  xp              Int       @default(0)
  level           Int       @default(1)
  lastSessionDate DateTime? @db.Date
```

(Only the five new lines are additions — `isAdmin` is shown for anchor context, don't duplicate
it.)

- [ ] **Step 2: Push the schema change**

Run: `npx prisma db push`
Expected: output confirms `profiles` table altered, no data loss warnings (all new columns have
defaults or are nullable).

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes without error (this project's Prisma client isn't currently used by the app
code — Supabase JS handles all runtime queries — but keeping it in sync avoids drift for anyone
who does use it later).

- [ ] **Step 4: Verify the columns exist**

Run (via `mcp__supabase__execute_sql` or `psql`, whichever this project's workflow uses for the
connected database):
```sql
select current_streak, longest_streak, xp, level, last_session_date from profiles limit 1;
```
Expected: query succeeds and returns `0, 0, 0, 1, null` for existing rows (Prisma maps
`currentStreak` → `current_streak` etc. via its default snake_case column naming — confirm the
actual column names with `\d profiles` if the query above errors on naming).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
Add streak/xp/level fields to Profile

Existing rows backfill to safe defaults (streak 0, xp 0, level 1). No
data migration needed - these are all zero-state defaults for users
who've never logged a session under the new system.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Leveling formula module

**Files:**
- Create: `lib/leveling.ts`

**Interfaces:**
- Produces: `computeLevel(xp: number): number`, `xpForCompletion(newStreak: number): number`,
  `computeStreakUpdate(params: { lastSessionDate: string | null; today: string; currentStreak: number }): { newStreak: number; xpGained: number }` —
  all consumed by Task 4.

- [ ] **Step 1: Write `lib/leveling.ts`**

```ts
// lib/leveling.ts

/** Every 100 xp = one level. Kept separate from the schema so the curve
 * can be retuned later without a migration. */
export function computeLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

/** xp awarded for a single completed workout, given the streak length
 * that completion produces. A 20xp bonus lands every 7th consecutive day. */
export function xpForCompletion(newStreak: number): number {
  const base = 10;
  const milestoneBonus = newStreak > 0 && newStreak % 7 === 0 ? 20 : 0;
  return base + milestoneBonus;
}

type StreakUpdateParams = {
  /** ISO date string (YYYY-MM-DD) of the profile's last completed session, or null if none yet. */
  lastSessionDate: string | null;
  /** ISO date string (YYYY-MM-DD) of today's completion. */
  today: string;
  currentStreak: number;
};

type StreakUpdateResult = {
  newStreak: number;
  /** 0 when the completion is a same-day repeat (no farming via multiple logs/day). */
  xpGained: number;
};

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function computeStreakUpdate({
  lastSessionDate,
  today,
  currentStreak,
}: StreakUpdateParams): StreakUpdateResult {
  if (lastSessionDate === null) {
    return { newStreak: 1, xpGained: xpForCompletion(1) };
  }

  const diff = daysBetween(lastSessionDate, today);

  if (diff === 0) {
    return { newStreak: currentStreak, xpGained: 0 };
  }
  if (diff === 1) {
    const newStreak = currentStreak + 1;
    return { newStreak, xpGained: xpForCompletion(newStreak) };
  }
  // diff > 1 (or negative, e.g. clock skew) - streak restarts at 1.
  return { newStreak: 1, xpGained: xpForCompletion(1) };
}
```

- [ ] **Step 2: Verify with a disposable ts-node script**

This repo has no test runner configured (no jest/vitest, no `*.test.*` files anywhere) and
`ts-node` is already a dependency (used by `prisma/seed.js`). Rather than introducing a new test
framework for two pure functions, verify with a one-off script, run it, then delete it.

Create `scratch-verify-leveling.ts` at the repo root:

```ts
import { computeLevel, xpForCompletion, computeStreakUpdate } from './lib/leveling';

console.assert(computeLevel(0) === 1, 'level at 0xp should be 1');
console.assert(computeLevel(99) === 1, 'level at 99xp should be 1');
console.assert(computeLevel(100) === 2, 'level at 100xp should be 2');
console.assert(xpForCompletion(1) === 10, 'day 1 completion should be 10xp');
console.assert(xpForCompletion(7) === 30, 'day 7 (milestone) should be 30xp');
console.assert(xpForCompletion(8) === 10, 'day 8 (post-milestone) should be back to 10xp');

const first = computeStreakUpdate({ lastSessionDate: null, today: '2026-07-06', currentStreak: 0 });
console.assert(first.newStreak === 1 && first.xpGained === 10, 'first ever completion');

const sameDay = computeStreakUpdate({ lastSessionDate: '2026-07-06', today: '2026-07-06', currentStreak: 3 });
console.assert(sameDay.newStreak === 3 && sameDay.xpGained === 0, 'same-day repeat earns no xp, streak unchanged');

const nextDay = computeStreakUpdate({ lastSessionDate: '2026-07-06', today: '2026-07-07', currentStreak: 3 });
console.assert(nextDay.newStreak === 4 && nextDay.xpGained === 10, 'consecutive day increments streak');

const gap = computeStreakUpdate({ lastSessionDate: '2026-07-06', today: '2026-07-09', currentStreak: 5 });
console.assert(gap.newStreak === 1 && gap.xpGained === 10, 'gap > 1 day resets streak to 1');

console.log('All leveling assertions passed');
```

Run: `npx ts-node --compiler-options '{"module":"commonjs"}' scratch-verify-leveling.ts`
Expected output: `All leveling assertions passed` with no `Assertion failed` lines above it.

- [ ] **Step 3: Delete the scratch script**

```bash
rm scratch-verify-leveling.ts
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/leveling.ts
git commit -m "$(cat <<'EOF'
Add leveling formula module

Pure functions for xp/level/streak math, kept separate from the schema
so the curve can be retuned without a migration. Verified via a
disposable ts-node script (no test runner is configured in this repo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire streak/xp updates into session completion

**Files:**
- Modify: `app/session/_components/CompletionTracker.tsx`

**Interfaces:**
- Consumes: `computeStreakUpdate`, `computeLevel` from `lib/leveling.ts` (Task 3);
  `Profile.currentStreak/xp/lastSessionDate` columns (Task 2).
- Produces: nothing consumed by later tasks in this plan (Task 5 reads the same `profiles`
  columns independently via its own query).

- [ ] **Step 1: Import the leveling helpers**

In `app/session/_components/CompletionTracker.tsx`, add to the imports at the top:

```ts
import { computeLevel, computeStreakUpdate } from '@/lib/leveling';
```

- [ ] **Step 2: Extend the profile fetch to include streak/xp fields**

Find this block (around line 55):

```ts
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', user.id)
        .single();
```

Replace with:

```ts
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, currentStreak, longestStreak, xp, lastSessionDate')
        .eq('userId', user.id)
        .single();
```

- [ ] **Step 3: Compute and persist the streak/xp update after a successful session insert, only when `completed` is true**

Find this block (around lines 73-101):

```ts
      // Save the session completion data
      const { error } = await supabase.from('sessions').insert({
        profileId: profileData.id,
        date: today,
        sessionData: {
          bodyPart: plan.bodyPart,
          dayIndex: plan.dayIndex,
          completed,
          notes,
          difficulty,
          duration,
          exerciseLog
        }
      });
      
      if (error) {
        console.error('Error saving completion:', error);
        toast({
          title: "Error saving workout",
          description: "There was a problem saving your workout record",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Workout saved!",
          description: "Your workout has been recorded successfully",
          variant: "default"
        });
        onComplete();
      }
```

Replace with:

```ts
      // Save the session completion data
      const { error } = await supabase.from('sessions').insert({
        profileId: profileData.id,
        date: today,
        sessionData: {
          bodyPart: plan.bodyPart,
          dayIndex: plan.dayIndex,
          completed,
          notes,
          difficulty,
          duration,
          exerciseLog
        }
      });
      
      if (error) {
        console.error('Error saving completion:', error);
        toast({
          title: "Error saving workout",
          description: "There was a problem saving your workout record",
          variant: "destructive"
        });
        return;
      }

      if (completed) {
        const { newStreak, xpGained } = computeStreakUpdate({
          lastSessionDate: profileData.lastSessionDate,
          today,
          currentStreak: profileData.currentStreak,
        });
        const newXp = profileData.xp + xpGained;

        const { error: streakError } = await supabase
          .from('profiles')
          .update({
            currentStreak: newStreak,
            longestStreak: Math.max(profileData.longestStreak, newStreak),
            xp: newXp,
            level: computeLevel(newXp),
            lastSessionDate: today,
          })
          .eq('id', profileData.id);

        if (streakError) {
          console.error('Error updating streak/xp:', streakError);
        }
      }

      toast({
        title: "Workout saved!",
        description: "Your workout has been recorded successfully",
        variant: "default"
      });
      onComplete();
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Using a disposable test account:
- Complete a workout with "Mark workout as completed" checked. Confirm via SQL
  (`select current_streak, longest_streak, xp, level, last_session_date from profiles where id = '<id>'`)
  that `current_streak=1`, `xp=10`, `level=1`, `last_session_date=<today>`.
- Complete a second workout the same day. Confirm `current_streak` and `xp` are unchanged from
  the previous check (same-day repeat earns nothing).
- Manually back-date `last_session_date` via SQL to 3 days ago, then complete a workout. Confirm
  `current_streak` resets to `1` (not incremented from whatever it was).
- Manually set `last_session_date` to yesterday, then complete a workout. Confirm
  `current_streak` increments by exactly 1 and `xp` increases by 10 (or 30 if the resulting
  streak is a multiple of 7).
- Complete a workout with "Mark workout as completed" unchecked. Confirm none of
  `current_streak/longest_streak/xp/level/last_session_date` change.
- Clean up: reset the test profile's streak/xp/level columns back to their defaults via SQL
  when done.

- [ ] **Step 6: Commit**

```bash
git add app/session/_components/CompletionTracker.tsx
git commit -m "$(cat <<'EOF'
Update streak/xp/level on completed workout sessions

Only counts sessions marked completed. Same-day repeats earn no xp and
leave the streak unchanged, closing an obvious farming loop.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Display level/streak on the Profile page

**Files:**
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `Profile.currentStreak/longestStreak/xp/level` (Task 2), `computeLevel` from
  `lib/leveling.ts` (Task 3, used only to compute the xp threshold for the *next* level's
  progress bar — the stored `level` is trusted as-is for display).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add `Flame` to the lucide-react import**

Find (near line 10):

```ts
import { Loader2, Info, AlertTriangle, Sparkles, Bell } from 'lucide-react';
```

Replace with:

```ts
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame } from 'lucide-react';
```

- [ ] **Step 2: Extend the profile `select` to include the new columns**

Find (around line 51):

```ts
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin')
          .eq('userId', userId)
          .single();
```

Replace with:

```ts
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level')
          .eq('userId', userId)
          .single();
```

- [ ] **Step 3: Add the Level & Streak card**

In the JSX, insert a new card immediately after the "Personal Info" / "Health Metrics" grid
(right after the closing `</div>` of that `grid grid-cols-1 md:grid-cols-2 gap-6` block, before
the "AI Insights" card):

```tsx
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Level {profile.level}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{profile.xp} xp</span>
                      <span>{(profile.level) * 100} xp to next level</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-2 bg-orange-500 rounded-full"
                        style={{ width: `${(profile.xp % 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Current streak: <strong>{profile.currentStreak}</strong> day{profile.currentStreak === 1 ? '' : 's'}</span>
                    <span>Longest: <strong>{profile.longestStreak}</strong> day{profile.longestStreak === 1 ? '' : 's'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
```

Note: `profile.xp % 100` works as the "progress within current level" bar because
`computeLevel` (Task 3) uses a flat 100xp-per-level curve — `xp % 100` is exactly how far into
the current level the user is. If that formula is ever changed to a non-flat curve, this bar's
math must change with it (both live in the same mental model, but this file doesn't import
`computeLevel` to avoid a client-component/pure-function coupling that isn't needed for a
straight modulo).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Log in as the test account used in Task 4 (with a non-zero streak/xp from that task's testing,
or complete one workout now). Visit `/profile`. Confirm the Level card renders with the correct
level, xp, progress bar width, current streak, and longest streak matching the `profiles` row.

- [ ] **Step 6: Commit**

```bash
git add app/profile/page.tsx
git commit -m "$(cat <<'EOF'
Show level/xp/streak card on Profile page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Workout category illustrations + lookup map

**Files:**
- Create: `public/workouts/push.svg`
- Create: `public/workouts/pull.svg`
- Create: `public/workouts/legs.svg`
- Create: `public/workouts/full-body.svg`
- Create: `public/workouts/cardio.svg`
- Create: `public/workouts/rest.svg`
- Create: `lib/workoutVisuals.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `getWorkoutVisual(bodyPart: BodyPart | string): { src: string; alt: string }` from
  `lib/workoutVisuals.ts`, and a `.workout-visual-active` CSS class — both consumed by Task 7.

- [ ] **Step 1: Create the six SVG illustrations**

Each is simple line art using `currentColor` so it inherits text color, `viewBox="0 0 100 100"`,
consistent `stroke-width="4"`.

`public/workouts/push.svg` (dumbbell being pressed):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="10" y="35" width="14" height="30" rx="3"/>
  <rect x="76" y="35" width="14" height="30" rx="3"/>
  <line x1="24" y1="50" x2="76" y2="50"/>
  <path d="M50 50 L50 20"/>
  <path d="M42 28 L50 20 L58 28"/>
</svg>
```

`public/workouts/pull.svg` (bar with a downward pull arrow):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <line x1="15" y1="20" x2="85" y2="20"/>
  <line x1="35" y1="20" x2="35" y2="55"/>
  <line x1="65" y1="20" x2="65" y2="55"/>
  <path d="M50 45 L50 78"/>
  <path d="M42 70 L50 78 L58 70"/>
</svg>
```

`public/workouts/legs.svg` (squat stick figure):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="18" r="8"/>
  <line x1="50" y1="26" x2="50" y2="50"/>
  <path d="M50 50 L30 65 L30 85"/>
  <path d="M50 50 L70 65 L70 85"/>
  <line x1="22" y1="85" x2="38" y2="85"/>
  <line x1="62" y1="85" x2="78" y2="85"/>
</svg>
```

`public/workouts/full-body.svg` (jumping-jack stick figure):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="16" r="8"/>
  <line x1="50" y1="24" x2="50" y2="60"/>
  <path d="M50 34 L25 18"/>
  <path d="M50 34 L75 18"/>
  <path d="M50 60 L25 88"/>
  <path d="M50 60 L75 88"/>
</svg>
```

`public/workouts/cardio.svg` (heartbeat line):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 55 L30 55 L38 35 L48 75 L58 45 L66 55 L90 55"/>
</svg>
```

`public/workouts/rest.svg` (crescent moon with zzz):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M60 20 A28 28 0 1 0 60 80 A22 22 0 1 1 60 20 Z"/>
  <path d="M75 30 L85 30 L75 40 L85 40"/>
  <path d="M80 45 L87 45 L80 52 L87 52"/>
</svg>
```

- [ ] **Step 2: Create the lookup map**

```ts
// lib/workoutVisuals.ts
import type { BodyPart } from './ai/types';

type WorkoutVisual = {
  src: string;
  alt: string;
};

const WORKOUT_VISUALS: Record<BodyPart, WorkoutVisual> = {
  Push: { src: '/workouts/push.svg', alt: 'Push day illustration' },
  Pull: { src: '/workouts/pull.svg', alt: 'Pull day illustration' },
  Legs: { src: '/workouts/legs.svg', alt: 'Legs day illustration' },
  'Full Body': { src: '/workouts/full-body.svg', alt: 'Full body day illustration' },
  Cardio: { src: '/workouts/cardio.svg', alt: 'Cardio day illustration' },
  Rest: { src: '/workouts/rest.svg', alt: 'Rest day illustration' },
};

/** Falls back to the Rest illustration for any value outside the known BodyPart set
 * (defensive only - every caller in this app sources bodyPart from the fixed set). */
export function getWorkoutVisual(bodyPart: string): WorkoutVisual {
  return WORKOUT_VISUALS[bodyPart as BodyPart] ?? WORKOUT_VISUALS.Rest;
}
```

- [ ] **Step 3: Add the pulse animation to `app/globals.css`**

Append to the end of `app/globals.css`:

```css
@keyframes workout-visual-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

.workout-visual-active {
  animation: workout-visual-pulse 2s ease-in-out infinite;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add public/workouts lib/workoutVisuals.ts app/globals.css
git commit -m "$(cat <<'EOF'
Add workout category illustrations and lookup map

One custom SVG per body-part category (Push/Pull/Legs/Full Body/
Cardio/Rest), no new npm dependency. Pulse animation class added for
the active plan card, wired up in the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Show illustrations on PlanCard and WorkoutChecklist

**Files:**
- Modify: `app/session/_components/PlanCard.tsx`
- Modify: `app/session/_components/WorkoutChecklist.tsx`

**Interfaces:**
- Consumes: `getWorkoutVisual` from `lib/workoutVisuals.ts` (Task 6), `.workout-visual-active`
  CSS class (Task 6).

- [ ] **Step 1: Update `PlanCard.tsx` to show a small illustration next to the title**

Replace the full contents of `app/session/_components/PlanCard.tsx` with:

```tsx
'use client';
import React from 'react';
import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getWorkoutVisual } from '@/lib/workoutVisuals';

export type PlanDay = {
  dayIndex: number;
  bodyPart: string;
  repeatWeekly?: boolean;
};

type PlanCardProps = {
  plan: PlanDay | null;
  onStart: () => void;
  onAdd: () => void;
};

export function PlanCard({ plan, onStart, onAdd }: PlanCardProps) {
  const visual = plan ? getWorkoutVisual(plan.bodyPart) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {visual && (
            <Image
              src={visual.src}
              alt={visual.alt}
              width={28}
              height={28}
              className="workout-visual-active"
            />
          )}
          {plan
            ? `${plan.bodyPart} Day${plan.repeatWeekly ? ' 🔁' : ''}`
            : 'No Workout Scheduled'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center">
        {plan ? (
          <Button onClick={onStart}>Start Session</Button>
        ) : (
          <Button variant="outline" onClick={onAdd}>
            + Add Workout
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Update `WorkoutChecklist.tsx` to show a header illustration**

In `app/session/_components/WorkoutChecklist.tsx`, add to the imports:

```ts
import Image from 'next/image';
import { getWorkoutVisual } from '@/lib/workoutVisuals';
```

Find:

```tsx
export function WorkoutChecklist({ workoutType }: WorkoutChecklistProps) {
  const activities = activitiesByWorkoutType[workoutType] || [];

  return (
    <Card className="shadow-md">
      <CardContent className="pt-6">
        <CardTitle className="text-xl mb-4">Today&apos;s {workoutType} Checklist</CardTitle>
```

Replace with:

```tsx
export function WorkoutChecklist({ workoutType }: WorkoutChecklistProps) {
  const activities = activitiesByWorkoutType[workoutType] || [];
  const visual = getWorkoutVisual(workoutType);

  return (
    <Card className="shadow-md">
      <CardContent className="pt-6">
        <div className="flex justify-center mb-4">
          <Image src={visual.src} alt={visual.alt} width={64} height={64} />
        </div>
        <CardTitle className="text-xl mb-4">Today&apos;s {workoutType} Checklist</CardTitle>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Visit `/session` for a test profile with a scheduled plan for at least 3 of the 6 categories
(add plans via the `+` button / `AddWorkoutModal` if needed to cover all 6). For each category,
confirm:
- `PlanCard` shows the correct small illustration next to the title, pulsing.
- `WorkoutChecklist` shows the correct larger header illustration above the checklist title.
- No broken image icons in the browser (confirms each SVG file path in
  `lib/workoutVisuals.ts` resolves correctly under `public/workouts/`).

- [ ] **Step 5: Commit**

```bash
git add app/session/_components/PlanCard.tsx app/session/_components/WorkoutChecklist.tsx
git commit -m "$(cat <<'EOF'
Show workout category illustrations on PlanCard and checklist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
