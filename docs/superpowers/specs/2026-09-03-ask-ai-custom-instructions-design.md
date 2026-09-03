# Ask-AI Custom Instructions

## Problem

Several AI-backed "generate" actions across the app (BurnLog workout plan,
MoneyLog/BurnLog meal plan, TaskLog goal breakdown) always run the same
fixed prompt built purely from structured profile/form data. There's no way
for a user to steer a regeneration with a one-off freeform note ("make it
shorter this week", "I'm out for gluten this month", "focus on the writing
tasks first") without that becoming a permanent profile/form field.

This is the first rollout of a reusable "Ask AI" surface — a small
custom-instructions input, backed by the smoothui `morph-surface` +
`siri-orb` components already vendored into `components/smoothui/` (the
`siri-orb` addition shipped in the IntelLog loading-animation work) — wired
into the three existing "Regenerate" actions that best fit its shape: one
route, one trigger button, currently zero customization.

## Goals

- A generic `AskAiInput` component: opens into a text box, submits a
  freeform instruction string, drives the Siri orb through real
  idle/thinking/done/error states tied to the actual request lifecycle
  (not a demo/simulated amplitude).
- Wire it into the three pilot regenerate actions: BurnLog workout-plan
  regeneration (`PlanPreview`'s `onRegenerate`), TaskLog goal breakdown
  (`GoalCard`'s `handleGenerate`), and the BurnLog session's meal-plan
  regeneration (`MealChecklist`'s `handleGenerate`).
- Each pilot route accepts an optional `customInstructions` string and
  folds it into its existing prompt as one additional directive block —
  no restructuring of the existing structured inputs.
- Clicking Generate/Regenerate without ever opening the Ask-AI box behaves
  exactly as it does today (instructions omitted, prompt unchanged).

## Non-goals

- Not rolling out to every `app/api/ai/*` route — only the three named
  above. The rest are a documented fast-follow once this pattern proves out.
- Not persisting custom instructions anywhere — each submission is used for
  that one request only, then discarded (no history, no reuse next time).
- Not touching the onboarding-flow callers of these same routes (e.g.
  `TaskLogOnboardingFlow`, the BurnLog AI-setup wizard's first automatic
  generation) — only the explicit user-triggered "Regenerate" actions.
- Not changing `MealPlannerFlow`'s multi-step wizard (which already has a
  freeform "favorite meals" field) — confirmed with the user to target the
  session view's single-button "Regenerate meal plan" instead.

## Component design

### Vendored files (shadcn-registry pulls, same pattern as `siri-orb`/`ai-core`)

- `components/smoothui/smooth-button/index.tsx` — dependency of `morph-surface`.
- `components/smoothui/morph-surface/index.tsx` + its `use-click-outside.tsx`
  helper — vendored as-is from `https://smoothui.dev/r/morph-surface.json`.

As vendored, `MorphSurface` is a self-contained component with a hardcoded
"Ask AI" label/placeholder and a submit handler that doesn't read the
textarea value anywhere. It is not used directly — see below.

### `components/ai/AskAiInput.tsx` (new, hand-written wrapper)

```ts
export interface AskAiInputProps {
  /** Button/dock label. Defaults to "Ask AI". */
  label?: string;
  /** Textarea placeholder. Defaults to "Ask me anything…". */
  placeholder?: string;
  /** Called with the trimmed instruction text on submit. */
  onSubmit: (instructions: string) => Promise<void>;
}
```

Internally: a small local state machine (`'idle' | 'open' | 'submitting' |
'done' | 'error'`) drives a `SiriOrb` rendered in the dock (mirroring the
vendored `MorphSurface`'s own dock-orb placement) — `idle` while closed,
`thinking` while `onSubmit`'s promise is pending, `done` for ~1.5s on
success (matching the vendored component's own `SUCCESS_DURATION`), `error`
briefly on rejection before returning to `idle`. The open/close panel
mechanics, click-outside, Escape, and ⌘+Enter submit are the vendored
`MorphSurface` behavior, reused as-is; only the textarea's value being
threaded into a real `onSubmit` prop (instead of the vendored stub) and the
label/placeholder being props (instead of hardcoded strings) are new.

## Per-route change

Each of the three routes gains the same shape of change:

1. Request body type gains `customInstructions?: string`.
2. `buildPrompt(...)` gains an optional last parameter, appended to the
   prompt only when non-empty:
   ```
   Additional instructions from the user (follow these unless they conflict
   with the rules above): {customInstructions}
   ```
3. `/api/ai/meal-plan/route.ts` currently expects no request body at all
   (`fetch('/api/ai/meal-plan', { method: 'POST' })`, no body) — its POST
   handler starts parsing an optional JSON body (`request.json().catch(()
   => ({}))`, since the client may still send no body when no instructions
   were entered).

## Per-trigger UI change

Each of the three trigger points renders an `AskAiInput` next to its
existing Generate/Regenerate button:

- **BurnLog** (`app/(burnlog)/burnlog/ai-setup/_components/PlanPreview.tsx`
  + `AiSetupFlow.tsx`): `AskAiInput` next to the existing `onRegenerate`
  button; `handleRegenerate` (currently `requestPlan(lifestyle)`) gains an
  optional `customInstructions` argument threaded into the POST body.
- **TaskLog** (`app/(tasklog)/tasklog/goals/_components/GoalCard.tsx`):
  `AskAiInput` next to the existing Generate/Regenerate-tasks button;
  `handleGenerate` threads `customInstructions` into the POST body.
- **BurnLog session** (`app/(burnlog)/burnlog/session/_components/MealChecklist.tsx`):
  `AskAiInput` next to the existing meal-plan generate button;
  `handleGenerate` sends `{ customInstructions }` as the POST body instead
  of no body (omitted entirely when blank, preserving today's no-body call).

## Testing

- Unit tests for each route's `buildPrompt` extension: with
  `customInstructions` present, the extra directive block appears verbatim
  in the output; with it absent/empty, the prompt is byte-identical to
  today's output (regression guard).
- No component tests for `AskAiInput` itself (no existing precedent for
  testing vendored-UI wrapper components in this repo — verified manually
  in the browser instead, same as the IntelLog SiriOrb work).

## Future (explicitly deferred, not built here)

- Rolling out to the remaining `app/api/ai/*` routes.
- Persisting/recalling past custom instructions.
- Extending to the onboarding-flow callers of these same routes.
