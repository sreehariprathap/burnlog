# TaskLog AI Onboarding — Design Spec

Sub-project 2.1 of the "Logbook as platform hub" initiative (see
`docs/superpowers/specs/2026-08-31-identity-consolidation-design.md`
for the initiative and `docs/superpowers/specs/2026-08-31-onboarding-foundation-design.md`
for sub-project 2.0, which this builds on). First of four per-app
onboarding builds (2.1 TaskLog, then 2.2 HomeLog, 2.3 SocialLog, 2.4
ShoppingLog), each plugging into the orchestrator sub-project 2.0
built at `app/onboarding/sequence/page.tsx`.

## Problem

TaskLog has no onboarding — a newly-enabled TaskLog user lands
straight on `/tasklog` with nothing set up. But TaskLog already has
real AI infrastructure sitting unused for this purpose:
`/api/ai/tasklog/breakdown` (an OpenRouter-backed endpoint that turns
a goal into 4–8 concrete suggested tasks) and `BreakdownReviewSheet`
(a review/edit/confirm UI for those suggestions), both currently only
reachable from the Goals page's "Generate tasks" button on an
already-created goal.

## Goal

When a user selects TaskLog (at signup or later via "Add another
app"), the orchestrator routes them through a TaskLog-specific
onboarding: they enter one or more goals, each gets broken into
AI-suggested tasks they review and confirm, and they land back in the
flow with real goals and tasks already in place plus a short
motivational close.

## Non-goals

- No new AI capability — reuses `/api/ai/tasklog/breakdown` and
  `BreakdownReviewSheet` verbatim.
- No schema changes — `TaskGoal` and `Task` already support everything
  this needs.
- HomeLog/SocialLog/ShoppingLog onboarding — sub-projects 2.2–2.4.

## Design

### Route

New `app/(tasklog)/tasklog/onboarding/page.tsx` +
`app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx`,
mirroring MoneyLog's onboarding structure
(`app/(moneylog)/moneylog/onboarding/`) — a `'use client'` component
holding a `Step` union in `useState`, reading `returnTo` from
`useSearchParams()` (default `/tasklog`) from the start, since
MoneyLog's flow needed retrofitting for this and this one shouldn't.

### Flow

**1. Welcome** — explains what's about to happen ("Add 1–3 goals you
want to make progress on — we'll break each into concrete tasks").
Two actions: "Get started" (→ goal entry) and "Skip" (→ `returnTo`
immediately, no goals created — matches MoneyLog's `handleSkipAll`
pattern exactly).

**2. Goal entry** — a form for title (required), description
(optional), category (`life`/`work` — the same fields
`AddGoalForm` already collects), with an "Add another goal" action
that appends to a local list (not yet persisted) and shows the list
so far. "Continue" is enabled once at least one goal is in the list.

**3. Sequential breakdown + review** — for each goal in the local
list, in order:
- Insert it into `task_goals` (`profileId`, `title`, `description`,
  `category`) via Supabase, same shape `AddGoalForm.handleSubmit`
  already uses.
- `POST /api/ai/tasklog/breakdown` with `{ title, description,
  category }` — the existing endpoint, unchanged.
- Show the existing `BreakdownReviewSheet` (imported directly from
  `app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet` —
  cross-route-group `_components` imports are already established in
  this codebase, e.g. `app/ai-setup/_components/AiSetupFlow.tsx`
  imports `GroceryStep` from
  `app/(burnlog)/goals/_components/GroceryStep`) with that goal's
  suggestions.
- On confirm, insert the selected suggestions into `tasklog_tasks`
  with `goalId` set to the just-created goal — identical insert shape
  to `GoalCard.handleConfirm`.
- Advance to the next goal in the list, or to the Done step once all
  are processed.

If the AI breakdown call fails for a given goal (network error, no
model available), the goal itself is still created (already inserted
before the call) — the review sheet is skipped for that one goal with
a toast explaining the failure, and the flow advances to the next
goal rather than blocking the whole onboarding on one AI call.

**4. Done** — a short templated (not AI-generated — no need for
another AI call just for copy) motivational summary: "You're set! N
goal{s} and M task{s} ready to go." with a "Go to TaskLog" button that
calls `router.replace(returnTo)`.

### Orchestrator wiring

`app/onboarding/sequence/page.tsx`'s `ONBOARDING_ROUTES` map gains:

```diff
 const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
   burnlog: '/ai-setup',
   moneylog: '/moneylog/onboarding',
+  tasklog: '/tasklog/onboarding',
 };
```

No other orchestrator change — the existing `returnTo`-chaining
mechanism already handles any route placed here.

### Config page parity

`app/(tasklog)/tasklog/config/page.tsx` currently has no
`onboardingHref` (TaskLog had no onboarding to point Reonboard at when
sub-project 1 built it). Add one, matching BurnLog's and MoneyLog's
pattern:

```diff
     <AppConfigShell
       appName="TaskLog"
+      onboardingHref="/tasklog/onboarding?returnTo=/tasklog/config"
       exportData={() => ({})}
```

### Files touched

New:
- `app/(tasklog)/tasklog/onboarding/page.tsx`
- `app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx`
- `app/(tasklog)/tasklog/onboarding/_components/WelcomeStep.tsx`
- `app/(tasklog)/tasklog/onboarding/_components/GoalEntryStep.tsx`
- `app/(tasklog)/tasklog/onboarding/_components/DoneStep.tsx`

Modified:
- `app/onboarding/sequence/page.tsx` — add `tasklog` to `ONBOARDING_ROUTES`
- `app/(tasklog)/tasklog/config/page.tsx` — add `onboardingHref`

Unchanged (reused as-is):
- `app/api/ai/tasklog/breakdown/route.ts`
- `app/(tasklog)/tasklog/goals/_components/BreakdownReviewSheet.tsx`
- `prisma/schema.prisma` — no migration

### Testing

No automated test suite in this repo — `tsc --noEmit` and `next lint`
after every task, as with sub-projects 1 and 2.0. Manual click-through:
select TaskLog during `/onboarding/apps` (alone or with BurnLog/
MoneyLog), confirm it sequences in after them, add two goals at the
goal-entry step, confirm each gets a real AI breakdown reviewed in
turn, confirm both goals and their confirmed tasks appear on
`/tasklog/goals` and `/tasklog/board` afterward, confirm landing on
`returnTo`. Separately, visit `/tasklog/config` and confirm
"Reonboard into TaskLog" opens the flow and returns to
`/tasklog/config` when finished. Confirm "Skip" on the welcome step
creates nothing and still advances the outer sequence correctly when
TaskLog isn't the last app selected.
