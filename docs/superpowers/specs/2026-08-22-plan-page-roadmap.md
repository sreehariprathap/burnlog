# "Plan" Page Roadmap — Multi-Week Programs, Day/Month Calendar, Tiered Goals

> **Status:** Living project plan, not an implementation spec. Each phase
> below gets its own brainstorming session → design spec →
> implementation plan before being built. Do not implement directly
> from this document — it exists so a phase can be picked up and
> dispatched (e.g. via `superpowers:subagent-driven-development`)
> without re-deriving the full context from scratch.

## Origin

The user pasted a Claude-generated 8-week transformation plan (weekly
workout schedule, meal rules, weekend activity progression, per-week
checklists, milestones) and asked what it would take for the app to
ingest plans like it. That grew, through discussion, into a broader
redesign of the existing Workout page into a unified "Plan" experience
with a Day/Month calendar (referencing a screenshot of a calendar app
with a streak counter, per-day workout labels, and rest-day markers)
and three tiers of goals (daily/weekly/monthly).

## Decisions already made (do not re-litigate without new information)

- **Full per-week flexibility**: unlike the initial MVP proposal (reuse
  the existing single-repeating `WorkoutPlan` template, vary only
  weekends), the user wants every week of a program independently
  editable — workout schedule, meal guidance, and extras can all differ
  week to week. `WorkoutPlan`'s current schema (`@@unique([profileId,
  dayOfWeek])`, no week dimension) cannot represent this and will need
  a new week-indexed model.
- **Nav placement**: the 8-week Program concept merges into the
  existing Workout tab (`/session` route, "Workout" label +
  `DumbbellIcon` in `components/BottomNav.tsx`), not a new tab or a
  7th `SmoothTabs` icon on Goals. The Workout page itself gets renamed
  to something like "Plan" (exact label TBD when this phase is
  designed). **Explicit constraint: zero data loss** — existing
  `sessions`, `workout_plans`, and `Workout`/history data must survive
  the merge/rename untouched or migrated, not dropped.
- **Day/Month toggle**: modeled on the attached reference screenshot —
  a "Month ▾" dropdown-style switch at the top, a streak-counter/rest-day
  header row, and a calendar grid where each day shows a compact label
  (e.g. "Full Body 1") when a workout is scheduled/logged, blank for
  rest days. The user wants: **Day view** = today's workout + today's
  meal guidance + "anything extra for today" + a water intake tracker.
  **Month view** = calendar grid with streaks, missed-day ("skip day")
  markers, and a star/badge on days where goals were fully met.
- **Goal tiers**: daily, weekly, and monthly goals are all needed —
  today's `FitnessGoal` model has no time dimension at all (just
  `goalType` + `targetValue`, open-ended forever). This is a real gap,
  not a UI-only concern.
- **One active program at a time** — starting a new 8-week program
  replaces/archives the previous one. No requirement (yet) to browse a
  history of past programs.
- **Milestone convergence**: a fully-checked week (or fully-met daily
  goals for a calendar day) should plug into the *existing* XP/streak
  system built for the dashboard Consistency Tracker
  (`lib/leveling.ts`, `AchievementOverlay`) rather than inventing a
  parallel rewards system.

## Relevant prior art in this codebase (reuse, don't rebuild)

- **AI-generate → validate → preview → persist pattern**: the AI
  workout onboarding flow (`app/api/ai/workout-plan/route.ts`,
  `lib/ai/openrouter.ts`, `app/ai-setup/_components/PlanPreview.tsx`)
  is the exact template for any future AI-assisted program ingestion:
  prompt with an explicit inline JSON shape → `JSON.parse` +
  hand-rolled structural validation (no zod in this codebase) → retry
  once on failure → editable preview step → client-side Supabase
  upsert with `onConflict` for idempotency.
- **Model selection**: `AiModelSetting` / `lib/ai/modelConfig.ts`'s
  `getModel(supabase, 'text' | 'vision')` — every AI route resolves its
  model this way, admin-configurable, with hardcoded fallbacks.
- **Cron/push infra**: `app/api/cron/evening-checkin/route.ts` +
  `lib/pushNotification/server.ts::sendPushToUser` + `vercel.json`'s
  cron entry — directly reusable for a weekly check-in or "you haven't
  logged your weigh-in" reminder once a program model exists to check
  against.
- **Consistency/XP system** (just shipped):
  `app/dashboard/_components/ConsistencyTracker.tsx`, `lib/consistency.ts`,
  `lib/leveling.ts`, `Profile.lastConsistencyBonusWeek` — the pattern
  for "compute a week's worth of activity from several tables, award a
  one-time bonus guarded by a persisted dedupe key, celebrate via
  `AchievementOverlay`" should extend here rather than being duplicated.
- **Existing Workout/session system** (`app/session/`): `DayNavigator`,
  `PlanCard`, `SessionLogger` (+ per-bodypart loggers),
  `CompletionTracker`, `WorkoutHistory`, `WorkoutChecklist`,
  `AddWorkoutModal`. Any redesign must account for all of these, not
  just the top-level page.

## Phase breakdown

### Phase 0 — Rename/merge groundwork (small, low-risk, do first)
Rename the Workout nav entry/page toward "Plan" (or whatever label the
Phase 1 brainstorm settles on) with zero data/behavior loss — a pure
relabeling + routing pass to de-risk before any real feature work
lands on top of it. Candidate for a very short, almost mechanical
implementation plan on its own.

### Phase 1 — Day/Month calendar shell
Add the Day/Month toggle to the (renamed) Plan page. Day view initially
just re-presents what `app/session/page.tsx` already shows (today's
`PlanCard`/`SessionLogger`) — no new data model required yet, since it
can render off the existing single-repeating `WorkoutPlan` + `sessions`
history. Month view is new: a calendar grid reading `sessions` (for
logged/completed days) and `WorkoutPlan` (for scheduled body part per
weekday) to render labels, streak header (reuse `Profile.currentStreak`),
and missed/rest-day markers. **This phase intentionally ships against
the current simple data model** — it proves out the calendar UI cheaply
before Phase 3 upgrades the underlying schema to full per-week programs,
at which point the calendar just gets richer data to render.

Explicitly out of scope for Phase 1: per-week-varying schedules, meal
guidance, water tracker, goal-met stars (needs Phase 2's goal tiers).

### Phase 2 — Tiered goals (daily / weekly / monthly)
Extend or replace `FitnessGoal` with a time dimension so "goal met"
can be evaluated per day, per week, and per month. This is required
before the Month view's "star on days where goals were met" can mean
anything real, and before "successful completion of goals gives
milestones/bonus XP" (the user's original ask) can be implemented
precisely rather than approximated by the whole-week consistency
bonus that already exists.

### Phase 3 — Full 8-week Program model
The big one: a week-indexed schedule (workout per weekday per program
week, meal/nutrition rules per week, weekend activity per week,
per-week checklist, milestones), replacing/extending `WorkoutPlan`'s
single-template limitation. Feeds richer data into the Phase 1 calendar
and Day view (meal guidance, "extra for today", weekend activity).

### Phase 4 — Program ingestion
Two entry points, not mutually exclusive:
- **Paste-and-structure**: user pastes a freeform plan (like the one
  that kicked off this whole conversation); an AI call restructures it
  into the Phase 3 schema, then the existing preview/edit/save pattern
  applies.
- **In-app generation**: a questionnaire (current weight, target,
  timeframe, schedule constraints, equipment) drives an AI call that
  generates the same structured shape directly, reusing
  `lib/ai/openrouter.ts`'s validate-and-retry pattern.

### Phase 5 — Water intake tracker
New lightweight model + Day-view widget. Small and mostly independent
of the other phases; could be pulled forward or built in parallel if
convenient, since it doesn't depend on the Program/goal-tier work.

## Sequencing rationale

Phase 1 before Phase 3 is deliberate: shipping the calendar UI against
today's simple data model first means the Program schema design (Phase
3, the most architecturally risky piece) can be validated against a
UI that already exists and already works, rather than designing both
at once and discovering a mismatch late. Phase 2 (goal tiers) is
ordered before Phase 3 because Phase 3's per-week checklist and
milestone logic will want to reuse whatever "is this goal met"
evaluation Phase 2 builds, rather than inventing a second one.

## Next step

Brainstorm Phase 0 + Phase 1 together (they're small and sequential)
as the first concrete design spec + implementation plan.
