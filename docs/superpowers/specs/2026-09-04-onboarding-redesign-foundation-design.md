# Onboarding Redesign — Foundation — Design Spec

Sub-project 1 of the "Onboarding Redesign" initiative — an aesthetic
and functional overhaul of new-user onboarding, building on top of
the existing signup → app-selection → per-app-sequence flow shipped
in `docs/superpowers/specs/2026-08-31-onboarding-foundation-design.md`
(that doc's sub-project 2.0) and the post-login walkthrough shipped
separately as a bounded change (no spec doc) — see the `AppTour`
component and the `hasSeenAppTour` column it introduced.

Full initiative, in build order:

1. **Foundation** (this doc) — signup/profile rework, AI-insights
   consent step, app-selection redesign, a shared per-app onboarding
   step-shell, and a finishing celebration screen.
2. BurnLog onboarding — new lifestyle/commute step.
3. MoneyLog onboarding — add optional asset value.
4. HomeLog onboarding — "create your home" step.
5. SocialLog onboarding — bio, visibility, avatar, interests/hobbies.
6. ShoppingLog onboarding — explainer + MoneyLog wallet integration note.
7. LearnLog onboarding — already has AI-suggestion infra
   (`lib/learnlog/onboarding.ts`); confirm it's wired to the new
   step-shell.
8. TravelLog onboarding — "digital passport": visited countries, then
   per-country state/province multi-select.
9. IntelLog — no data-collection onboarding; a one-screen AI-assistant
   explainer plus the data-use disclaimer, slotted into the sequence
   only when `aiEnabled`.
10. Theming pass — verify every step in 2–9 above carries its own
    app's `themeClass`; this doc's screens (steps outside any single
    app) carry Logbook's.

TaskLog's existing onboarding (sub-project 2.1 of the prior
initiative) stays as-is — no changes.

Each numbered item above is its own brainstorm → spec → plan →
implementation cycle. This document covers **only item 1**.

## Problem

The current onboarding (shipped in the prior initiative) is
functionally complete but visually minimal — plain cards, no
animation, no per-app identity beyond an inherited theme class, and
it collects less than the product now needs:

- `/signup/profile` collects `age` (a raw number) instead of date of
  birth, has no location capture, and silently auto-generates
  `username` without ever showing it to the user.
- There is no explicit AI-insights opt-in moment — `aiEnabled`
  defaults to `false` and is only ever flipped from deep inside
  BurnLog's `/ai-setup` consent step, so most users never see it.
- `/onboarding/apps` renders every `AppId` except `logbook` — which
  today includes `adminlog` (should never be user-selectable) and
  `intellog` (should only appear once AI is opted into).
- Each per-app onboarding screen (BurnLog, MoneyLog, TaskLog, HomeLog)
  implements its own "skip" affordance independently, with no shared
  visual language or guaranteed way back to it later.
- There's no closing moment — the sequence orchestrator silently
  redirects to `/logbook` with no acknowledgement that setup is done.

## Goal

A new user's setup should feel like one considered, good-looking
product moment: their date of birth, location, and a username they
actually chose; a real explanation of what AI does for them before
asking them to turn it on; an icon-driven app picker that never shows
AdminLog and only shows IntelLog once AI is on; every subsequent
per-app step wrapped in the same themed shell with a consistent
Continue/Skip pattern; and a celebratory finish before landing in
Logbook (where the existing app-tour then picks up).

## Non-goals

- Any per-app onboarding **content** (BurnLog's new lifestyle step,
  MoneyLog's asset value field, HomeLog/SocialLog/ShoppingLog/
  LearnLog/TravelLog/IntelLog builds) — sub-projects 2–9.
- Real legal/privacy-policy copy — see Disclaimer section below.
- Changing how `enabledApps` filtering drives `AppSwitcher` — reused
  as-is from the prior initiative.
- A "resume where I left off" mechanic beyond what already exists
  (the sequence orchestrator is stateless via URL params; unchanged).

## Design

### Schema changes

On `Profile` (all additive/renaming, applied via a normal Prisma
migration):

```prisma
dateOfBirth DateTime?
city        String?
postalCode  String?
```

`age Int` is removed from the signup form and, once every read site is
converted (see below), dropped from the schema. A migration backfills
existing rows' `dateOfBirth` from their stored `age` (Jan 1 of the
inferred birth year — lossy, but every consumer only ever needs a
whole-number age for a calculation, not a real birthday) before the
column is dropped.

New shared helper `lib/age.ts`:

```ts
export function getAge(dateOfBirth: Date | string): number { ... }
```

Nine existing call sites read `profile.age` today and move to
`getAge(profile.dateOfBirth)`:
`app/profile/page.tsx`, `app/(burnlog)/burnlog/dashboard/config/page.tsx`,
`app/api/ai/estimate-workout-calories/route.ts`,
`app/api/ai/meal-plan/route.ts`, `app/api/intellog/benchmark/route.ts`,
`app/api/cron/intel-cohort/route.ts`, `lib/ai/program.ts`,
`lib/ai/openrouter.ts`, `lib/ai/mealPlanPrompt.ts`,
`lib/intellog/chatContext.ts`.

`username` stays `@unique`; a new `GET /api/username-available?u=...`
endpoint (simple existence check via the service-role client, admin
gate not needed — it's a public availability check, mirroring how
signup already works unauthenticated) backs a debounced live-check on
the profile step.

### Step 1 — `/signup/profile` (Logbook-themed)

Trimmed to: first/last name, date-of-birth picker, city + country
(existing `country` field, reused) + postal code, and a username field
pre-filled with today's auto-generated suggestion but editable, with
inline "available"/"taken" feedback from the new endpoint. Height,
weight, and activity level are removed from this step entirely — they
move to BurnLog's new onboarding step (sub-project 2), collected only
if BurnLog is selected.

On save → `/onboarding/ai-insights` (new route, replacing today's
direct jump to `/onboarding/apps`).

### Step 2 — `/onboarding/ai-insights` (new, Logbook-themed, full screen)

Full-bleed screen: `SiriOrb` (already used in `AppTour`'s neighboring
components, `components/smoothui/siri-orb`) animating center-stage,
large-type copy underneath explaining concretely what AI does across
the product — a fitness coach adjusting plans, a financial coach
spotting patterns, a task coach breaking down goals — then a
prominent Yes/No choice (not a form field; two large buttons).

- **Yes** → `aiEnabled: true`.
- **No** → `aiEnabled: false` **and** every existing per-app AI
  sub-toggle is force-disabled in the same write:
  `learnLogAiEnabled: false`, `weeklyTripSuggestionsEnabled: false`
  (the two that exist today; sub-projects 2–9 that add their own
  per-app AI toggle must default it off when `aiEnabled` is false at
  onboarding time — noted as a constraint for those specs, not solved
  here).

Below the choice, a short disclaimer line (see Disclaimer section)
links to `/privacy`.

Either way → `/onboarding/apps`.

### Step 3 — `/onboarding/apps` (Logbook-themed)

`SELECTABLE_APPS` changes from "every `AppId` except `logbook`" to:

```ts
const SELECTABLE_APPS = Object.values(APPS).filter(
  (app) => app.id !== 'logbook'
    && app.id !== 'adminlog'
    && (app.id !== 'intellog' || aiEnabled)
);
```

`aiEnabled` is read from the profile row fetched on mount (already
available — this page already does a `getUser()` round-trip before
saving). Cards are redesigned to show each app's real mark (reusing
the `AppIcon` switch already written in `components/AppSwitcher.tsx`,
extracted into a small shared `AppIcon` export both files import) plus
name and tagline, in a larger, more tactile grid.

### Step 4 — shared per-app step-shell

New `components/onboarding/OnboardingStepShell.tsx`:

```tsx
<OnboardingStepShell
  app="burnlog"                // sets themeClass on mount, unset on unmount
  step={2} totalSteps={5}      // progress dots
  onSkip={() => router.push(returnTo)}   // "Skip — set up later from BurnLog settings"
  skipLabel="Set up later from BurnLog settings"
>
  {children}
</OnboardingStepShell>
```

`AiSetupFlow`, `MoneyLogOnboardingFlow`, TaskLog's and HomeLog's
existing onboarding flows are wrapped in this shell (their internal
step content is untouched — this is a visual/behavioral consistency
pass over existing multi-step flows, not a rewrite of their content).
Each flow's existing `returnTo`-based skip logic plugs into `onSkip`
unchanged.

### Step 5 — finishing celebration (new route, Logbook-themed)

`/onboarding/complete`, the sequence orchestrator's new default
`returnTo` terminus before `/logbook`: a fireworks burst animation,
the Logbook mark/wordmark (reusing `SplashScreen`'s existing
`logbook` entry in `SPLASH_CONTENT`), "Welcome to LogBook", and a
Continue button → `/logbook` (where `AppTour` then fires on arrival,
unchanged from the prior work).

### Disclaimer (data use / privacy)

Two placements, both linking to a new static `/privacy` route:

1. A line under the Yes/No choice on `/onboarding/ai-insights`:
   *"If you turn this on, your activity across the apps you use may
   be used to power AI features and improve how they work. See our
   Privacy Policy."*
2. On IntelLog's explainer screen (sub-project 9): a fuller paragraph
   in the same spirit plus an explicit mention that data may be used
   to train/improve the underlying AI.

**This copy is a functional placeholder, not real legal text.** I'm
not qualified to write language that actually protects the product
from liability or satisfies real privacy-law requirements (GDPR/CCPA
disclosures, data-retention terms, etc.). Before this ships to real
users, the `/privacy` page and both disclaimer strings need review by
an actual lawyer. This is flagged here explicitly so it isn't lost
between now and launch.

## Testing

- Migration: verify backfilled `dateOfBirth` on a copy of existing
  rows, verify `getAge()` matches previously-stored `age` within a
  day's rounding tolerance.
- Manual click-through: signup → DOB/location/username → AI-insights
  Yes and No paths → app selection (confirm AdminLog never appears,
  IntelLog only appears on the Yes path) → each selected app's
  step-shell (Skip and Continue both work) → finishing celebration →
  `/logbook` → app-tour fires.
- Typecheck/lint/build across all nine `.age` call sites.
