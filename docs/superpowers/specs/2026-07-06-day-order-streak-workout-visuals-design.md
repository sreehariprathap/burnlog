# Day Order Fix, Streak/Level Tracker, Workout Category Visuals

## Context

Three independent, already-scoped fixes/additions bundled into one pass ahead of the bigger
AI-expansion and onboarding-pages sub-projects (specced separately). None of these three touch
each other's code paths; they're grouped here purely for convenience of shipping together.

## 1. Day order fix

`app/session/_components/DayNavigator.tsx` currently renders `['Sun','Mon',...,'Sat']` with the
array index used directly as both the display order and the `dayOfWeek` value passed to
`onChange`. That index already matches JS `Date.getDay()` (0=Sun...6=Sat), which is also the
convention used by `WorkoutPlan.dayOfWeek` (prisma schema) and the AI prompt in
`lib/ai/openrouter.ts`. None of that underlying convention changes.

Fix: introduce a display-order mapping so the buttons render Mon→Sun while still emitting the
correct 0=Sun...6=Sat value on click:

```ts
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, values are dayOfWeek
const LABELS: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
```

Render by mapping over `DISPLAY_ORDER`, looking up the label per value, highlighting when
`value === dayOfWeek`. `app/session/page.tsx`'s `useState<number>(new Date().getDay())` default
and `fetchPlan`'s `.eq('dayOfWeek', day)` query are untouched.

Also delete `app/session/_components/weeklyNavigator.tsx` — confirmed dead code (not imported by
any page; `grep` shows only its own self-reference), a duplicate of `DayNavigator` with the same
Sun-first ordering and no `dayOfWeek` semantics wired in at all.

## 2. Streak / level tracker

### Schema (`prisma/schema.prisma`, applied via `prisma db push`, matching existing migration
style for this project)

Add to `Profile`:

```prisma
model Profile {
  // ...existing fields
  currentStreak   Int       @default(0)
  longestStreak   Int       @default(0)
  xp              Int       @default(0)
  level           Int       @default(1)
  lastSessionDate DateTime? @db.Date
}
```

Existing rows backfill to the column defaults (streak 0, xp 0, level 1, `lastSessionDate` null)
— no data migration script needed since these are all safe defaults for users who've never
logged a session under this system.

### Leveling formula (`lib/leveling.ts`, new file)

Kept separate from the schema/migration so the curve can be retuned later without touching the
database:

```ts
export function computeLevel(xp: number): number {
  return Math.floor(xp / 100) + 1; // every 100 xp = one level
}

export function xpForCompletion(newStreak: number): number {
  const base = 10;
  const milestoneBonus = newStreak > 0 && newStreak % 7 === 0 ? 20 : 0; // weekly streak bonus
  return base + milestoneBonus;
}
```

### Update point (`app/session/_components/CompletionTracker.tsx`)

This is the only place a workout completion is currently persisted (direct
`supabase.from('sessions').insert(...)`, no backend route — matches how every other write in
this app works). Streak/xp update happens in the same `handleSubmit`, only when `completed` is
true:

1. Fetch the profile's `currentStreak`, `xp`, `longestStreak`, `lastSessionDate` (already
   fetching the profile row here for `profileData.id`; extend the `select`).
2. Compute day-diff between `today` (already computed as `new Date().toISOString().split('T')[0]`)
   and `lastSessionDate`:
   - No prior `lastSessionDate` → `newStreak = 1`.
   - Diff is 0 days (same calendar day) → `newStreak = currentStreak` (no change — prevents
     logging multiple sessions in one day from inflating the streak).
   - Diff is exactly 1 day → `newStreak = currentStreak + 1`.
   - Diff > 1 day → `newStreak = 1` (streak broken, restart at 1 for today's session).
3. `xpGained = diff === 0 ? 0 : xpForCompletion(newStreak)` — same-day repeat completions earn
   no xp, closing the obvious farming loop (log, undo, re-log to rack up xp same day).
4. `newXp = xp + xpGained`, `newLevel = computeLevel(newXp)`, `newLongest = max(longestStreak, newStreak)`.
5. After the `sessions` insert succeeds, update `profiles`: `currentStreak`, `longestStreak`,
   `xp`, `level`, `lastSessionDate: today`.
6. If `completed` is false, none of the above runs — only completed workouts count.

### Display (`app/profile/page.tsx`)

New card (same visual pattern as the existing "AI Insights" / admin cards): current level, xp
progress toward next level (simple bar, same style as the existing BMI/BMR bars), current streak
with a flame icon, longest streak as a secondary stat.

## 3. Workout category visuals

Scoped to the 6 fixed categories used throughout the app (`Push`/`Pull`/`Legs`/`Full Body`/
`Cardio`/`Rest` — the same set `lib/ai/types.ts`'s `BODY_PARTS` and `WorkoutChecklist.tsx`
already key off of). Per-exercise imagery (`Workout.exerciseName` is freeform text) is out of
scope — no bounded set to source media for.

- New custom SVG illustrations (icon-style line art, not photos — nothing is fetched from
  external sources), one per category, stored at `public/workouts/<category-slug>.svg` (e.g.
  `push.svg`, `full-body.svg`).
- No new npm dependency (no Lottie/Framer Motion) — a subtle CSS keyframe animation
  (scale/pulse on the active card) added to `globals.css`, applied via a Tailwind class.
- Shown via `next/image`:
  - `PlanCard.tsx`: small illustration next to the category title.
  - `WorkoutChecklist.tsx`: larger header illustration above "Today's X Checklist".
- A shared `lib/workoutVisuals.ts` maps `BodyPart → { src, alt }` so both components (and any
  future one, e.g. `AddWorkoutModal`'s picker) read from one source of truth instead of
  duplicating the mapping.

## Testing / verification

- `tsc --noEmit` clean.
- Manual browser check (day order): `/session` shows Mon...Sun left-to-right, clicking each
  loads the correct plan (cross-check against a couple of `workout_plans` rows for the test
  profile).
- Manual browser check (streak): log a completed session today → level/xp/streak card updates;
  simulate a skipped day (manually back-date `lastSessionDate` via SQL) → next completion resets
  streak to 1; log two completions same day → streak/xp unchanged on the second.
- Manual browser check (visuals): each of the 6 categories renders its illustration on both
  `PlanCard` and `WorkoutChecklist`, animation plays on the active plan card.
- Clean up any test-account session/profile rows touched during verification.

## Out of scope (separate specs)

- AI expansion (dynamic checklists, insights, streak-triggered plan regeneration) — see
  `2026-07-03-ai-workout-onboarding-design.md`'s "Out of scope" list and the forthcoming spec for
  this sub-project.
- Feature-flagged onboarding pages / richer profile-building flow — forthcoming spec.
