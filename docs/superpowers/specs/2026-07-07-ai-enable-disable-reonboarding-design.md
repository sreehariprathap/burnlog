# AI Feature Enable/Disable with Re-onboarding

## Context

`Profile.aiEnabled` currently only ever goes `false -> true`, via the existing
`/ai-setup` flow (Consent -> Questionnaire -> Preview & edit, see
`2026-07-03-ai-workout-onboarding-design.md`). There is no way to turn AI back off, and no
re-entry story if there were. This spec adds:

1. A way to disable AI from the Profile page.
2. Re-enabling always routes back through the full `/ai-setup` flow (not a silent flag flip),
   with the questionnaire pre-filled from the user's previously saved answers and current
   profile stats already factored in (the AI route already fetches these server-side today).

Scoped to the AI feature only (`aiEnabled`) - not a general feature-flag framework. No other
part of the app currently has enable/disable + onboarding semantics to generalize from.

## Disable

`app/profile/page.tsx`'s "AI Insights" card: when `profile.aiEnabled` is `true`, show a
"Disable AI Insights" button (instead of/alongside today's "AI-powered suggestions are enabled"
text). On click:

```ts
await supabase.from('profiles').update({ aiEnabled: false }).eq('id', profile.id);
```

- No confirmation dialog - matches this page's existing button conventions (e.g. Log Out has
  none either).
- `workout_plans` rows and `profiles.lifestyle` are left completely untouched. The user keeps
  using their last AI-generated weekly schedule even with AI "off" - disabling only stops
  future AI-gated behavior (this and any later AI feature built on `aiEnabled`) from running.
  It is a flag flip, not a data reset.

## Re-enable

Unchanged entry point: Profile page's "Enable AI Insights" button routes to
`/ai-setup?returnTo=/profile`, same as first-time setup. No new page, no "already consented
before" tracking - the full three-step flow (Consent -> Questionnaire -> Preview & edit) runs
every time, whether this is the user's first time or their fifth time re-enabling.

The only change is pre-filling the questionnaire:

- `app/ai-setup/_components/AiSetupFlow.tsx`'s initial `useEffect` currently fetches only
  `profiles.id`. Extend the `select` to `'id, lifestyle'` and store the result in a new
  `initialLifestyle: LifestyleAnswers | null` state.
- Pass `initialLifestyle` to `<LifestyleForm initialAnswers={initialLifestyle} ... />`.
- `app/ai-setup/_components/LifestyleForm.tsx` gains an optional
  `initialAnswers?: LifestyleAnswers | null` prop. Each field's `useState` seeds from
  `initialAnswers?.<field> ?? <today's hardcoded default>` - so a true first-time user (no
  saved `lifestyle` row) sees exactly today's defaults, and anyone re-enabling sees their last
  answers pre-filled, still fully editable before submitting.

Everything downstream is unchanged:
- The AI route (`app/api/ai/workout-plan/route.ts`) already fetches the caller's own profile
  stats (age/weight/height/activityLevel) server-side and factors them into the prompt - no
  change needed, this already happens on every generation, first-time or re-enable.
- Generation ignores the current `workout_plans` rows and produces a fresh 7-day plan from
  whatever lifestyle answers get submitted (pre-filled or edited) - no plan-continuity logic.
- Save behavior (`handleSave` in `AiSetupFlow.tsx`) is unchanged: upserts all 7
  `workout_plans` rows and sets `aiEnabled: true` + `lifestyle: <submitted answers>`.

## Testing / verification

- `tsc --noEmit` clean.
- Manual browser verification (disposable test account):
  - Enable AI for the first time (empty `lifestyle`) -> confirm questionnaire shows today's
    hardcoded defaults, not blank/broken fields.
  - Disable AI from Profile -> confirm `aiEnabled` flips to `false` via SQL, `workout_plans` and
    `lifestyle` rows unchanged.
  - Re-enable -> confirm Consent step still shows, then Questionnaire is pre-filled with the
    previously saved answers, edit one field, save -> confirm new `workout_plans` reflect the
    fresh generation and `lifestyle` reflects the edited answers.
  - Confirm `/session` still shows the AI-disabled user's last plan correctly while
    `aiEnabled` is `false` (proves the "keep both, just flip the flag" behavior).
- Clean up all test data after verification.

## Out of scope

- Any other AI touchpoints (goals generator, insights banner, session guide, dashboard banner) -
  unrelated to this enable/disable lifecycle, still future specs per
  `2026-07-03-ai-workout-onboarding-design.md`.
- General feature-flag framework for non-AI features - explicitly deferred; this is AI-specific.
