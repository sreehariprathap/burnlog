# HomeLog AI Onboarding — Design Spec

Sub-project 2.2 of the "Logbook as platform hub" initiative (see
`docs/superpowers/specs/2026-08-31-identity-consolidation-design.md`
for the initiative, `docs/superpowers/specs/2026-08-31-onboarding-foundation-design.md`
for the orchestrator this plugs into, and
`docs/superpowers/specs/2026-08-31-tasklog-onboarding-design.md` for
sub-project 2.1's precedent). Third of four per-app onboarding builds
(2.1 TaskLog done, this is 2.2 HomeLog, then 2.3 SocialLog, 2.4
ShoppingLog).

## Problem

HomeLog has no dedicated onboarding route. Unlike BurnLog/MoneyLog/
TaskLog, HomeLog is a *shared* app — nothing meaningful (chores,
inventory, bills) exists until a `Household` does, and a household
requires either creating one or accepting an invite from someone who
already has. `/homelog` (the existing home page) already handles both
inline — create-household form, pending-invites accept/decline — but
that page isn't `returnTo`-aware and isn't part of the orchestrator
sequence. There's also no AI content for HomeLog yet: no equivalent of
TaskLog's `/api/ai/tasklog/breakdown` for suggesting a starter set of
chores.

## Goal

When a user selects HomeLog (at signup or later via "Add another
app"), the orchestrator routes them through a HomeLog-specific
onboarding: create or join a household, and — only when creating a
new one, since joining means the household is already someone else's
to configure — get AI-suggested starter chores to review and confirm,
ending with a motivational close.

## Non-goals

- Not touching `/homelog`'s existing inline household-creation/invite
  UI — it keeps working exactly as today for users who navigate there
  directly rather than through onboarding.
- No AI suggestions for inventory or bills — chores are the one
  "starter content" concept that maps cleanly to "create goals and
  motivate them" for a shared household; inventory/bills are
  transactional records with no sensible AI-generated starting set.
- SocialLog/ShoppingLog onboarding — sub-projects 2.3–2.4.

## Design

### Route

New `app/(homelog)/homelog/onboarding/page.tsx` +
`app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx`,
same step-state shape as `TaskLogOnboardingFlow`, reading `returnTo`
from `useSearchParams()` (default `/homelog`) from the start.

### Flow

**1. Welcome** — explains what's coming: "Create your household or
join one you've been invited to, then get some starter chores." Skip
→ `returnTo` immediately (matches MoneyLog's/TaskLog's skip pattern).

**2. Household setup** — a fresh, self-contained step component
(`HouseholdSetupStep`) with:
- A create-household form (household name → `POST
  /api/homelog/households`, the same route `/homelog`'s existing form
  already uses).
- A pending-invites list fetched from `GET /api/homelog/invites`,
  each with Accept (`POST /api/homelog/invites/[id]/accept`) / Decline
  (`POST /api/homelog/invites/[id]/decline`) — the same routes
  `/homelog` already uses.

This is a fresh, smaller component rather than an extraction/refactor
of `/homelog`'s existing implementation — lower risk, and the two
naturally diverge slightly (onboarding doesn't need the
already-a-member view `/homelog` shows, since by definition this step
only renders while the user has no household yet).

On successful household creation, the step calls `onCreated()`. On
successful invite acceptance, the step calls `onJoined()`. These are
distinct outcomes: creating means there's a new, empty household to
seed with chores; joining means the household the user joined already
belongs to someone else's setup, so there's nothing to suggest into
it.

**3. AI chore suggestion + review** (only reached via `onCreated()`,
skipped via `onJoined()`) — on entering this step:
- `POST /api/ai/homelog/suggest-chores` with `{ householdName }`.
- Show `ChoreSuggestionReviewSheet` (new component, structurally the
  same review/edit/confirm pattern as TaskLog's
  `BreakdownReviewSheet` but for chore fields — title, category,
  frequency, dayOfWeek) with the suggestions.
- On confirm, `POST /api/homelog/chores` once per selected suggestion
  (the existing route — it derives `householdId` server-side from the
  caller's membership and creates the first `HouseholdChoreInstance`
  automatically, so no other insert is needed).
- If the AI call itself fails, skip straight to Done with a toast —
  the household still exists and is fully usable with zero chores,
  same "don't block on one AI failure" rule sub-project 2.1
  established.

**4. Done** — a short templated summary: "Your household is set up
{with N starter chore{s} ready to go / — add chores anytime from the
Chores tab}." with a "Go to HomeLog" button → `router.replace(returnTo)`.

### New AI endpoint

`app/api/ai/homelog/suggest-chores/route.ts` — structurally identical
to `app/api/ai/tasklog/breakdown/route.ts` (same auth check via
`createRouteHandlerClient`, same `getModel(supabase, 'text')`, same
OpenRouter client, same `formatAiError` on failure), but:
- Request body: `{ householdName: string }`.
- Prompt asks for 5–8 common recurring household chores spanning
  `cleaning`/`maintenance`/`other` categories, each with a sensible
  `frequency` (`weekly`/`monthly`/`yearly`) and, for `weekly`, a
  `dayOfWeek` (0–6).
- Response shape: `{"chores": [{"title": "...", "category": "cleaning|maintenance|other", "frequency": "weekly|monthly|yearly", "dayOfWeek": 0-6 or null}]}`.
- Same validation/fallback pattern as the tasklog route: filter out
  entries with no title, coerce invalid `category`/`frequency` to
  sensible defaults (`other`/`weekly`) rather than rejecting the whole
  response.

### Orchestrator + config wiring

`app/onboarding/sequence/page.tsx`'s `ONBOARDING_ROUTES` gains:

```diff
 const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
   burnlog: '/ai-setup',
   moneylog: '/moneylog/onboarding',
   tasklog: '/tasklog/onboarding',
+  homelog: '/homelog/onboarding',
 };
```

`app/(homelog)/homelog/config/page.tsx` gains an `onboardingHref`,
matching the pattern established for BurnLog/MoneyLog/TaskLog:

```diff
     <AppConfigShell
       appName="HomeLog"
+      onboardingHref="/homelog/onboarding?returnTo=/homelog/config"
       exportData={() => ({})}
```

### Files touched

New:
- `app/(homelog)/homelog/onboarding/page.tsx`
- `app/(homelog)/homelog/onboarding/_components/HomeLogOnboardingFlow.tsx`
- `app/(homelog)/homelog/onboarding/_components/WelcomeStep.tsx`
- `app/(homelog)/homelog/onboarding/_components/HouseholdSetupStep.tsx`
- `app/(homelog)/homelog/onboarding/_components/ChoreSuggestionReviewSheet.tsx`
- `app/(homelog)/homelog/onboarding/_components/DoneStep.tsx`
- `app/api/ai/homelog/suggest-chores/route.ts`

Modified:
- `app/onboarding/sequence/page.tsx` — add `homelog` to `ONBOARDING_ROUTES`
- `app/(homelog)/homelog/config/page.tsx` — add `onboardingHref`

Unchanged (reused as-is):
- `app/(homelog)/homelog/page.tsx` and its inline household UI
- `app/api/homelog/households/route.ts`, `app/api/homelog/invites/*`, `app/api/homelog/chores/route.ts`
- `prisma/schema.prisma` — no migration

### Testing

No automated test suite — `tsc --noEmit` and `next lint` after every
task. Manual click-through: select HomeLog during `/onboarding/apps`,
confirm it sequences in, create a household on the welcome→setup
step, confirm the AI chore-suggestion review appears with real
suggestions, confirm accepted chores show up on `/homelog/chores`
with a due instance already created. Separately, with a second test
account, send that account a household invite from the first
account's `/homelog`, then run the second account through onboarding
and confirm accepting the invite on the household-setup step skips
straight to Done with no chore-suggestion step. Confirm
`/homelog/config`'s "Reonboard into HomeLog" returns to
`/homelog/config` when finished.
