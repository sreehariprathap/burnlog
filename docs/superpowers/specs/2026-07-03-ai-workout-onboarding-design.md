# AI Lifestyle Questionnaire → Workout Plan Generation

## Context

burnlog is adding AI-powered features across the app (goals generation, insights summaries,
session guidance, dashboard motivation). All of these will eventually run on a shared
OpenRouter-backed AI capability, gated by a single opt-in flag, and informed by a lifestyle
questionnaire collected once. This spec covers the **first phase only**: the opt-in gate plus
the signup lifestyle questionnaire that generates an initial 7-day workout plan. The other four
touchpoints (goals AI generator, insights banner, session AI guide, dashboard banner) are
out of scope here and will get their own specs once this phase ships and the shared plumbing
(OpenRouter client, `aiEnabled`/`lifestyle` data) exists to build on.

Model: OpenRouter free tier, `openai/gpt-oss-120b:free` (confirmed via OpenRouter's live
`/api/v1/models` listing as the strongest current free option for instruction-following /
structured JSON output). Configurable via env var, not hardcoded, so it can be swapped later
without a code change.

## Data model

Add to `Profile` (prisma/schema.prisma), applied via `prisma db push`:

```prisma
model Profile {
  // ...existing fields
  aiEnabled Boolean  @default(false)
  lifestyle Json?
}
```

- `aiEnabled` is the single global gate. No AI feature — this one or any future one — runs
  unless it's `true`. Defaults `false`; every existing user is unaffected until they opt in.
- `lifestyle` stores the questionnaire answers as JSON (job type, sitting hours, commute
  activity, exercise frequency, goal focus, injuries/limitations, preferred training days).
  Reused by future AI features so the user is never asked twice.
- Existing `profiles` RLS policy (owner-only via `auth.uid() = "userId"`) already covers new
  columns on the same row — no policy changes needed.

## Flow & routes

New route: **`app/ai-setup/page.tsx`**. Protected like any authenticated page (not in
middleware's `publicRoutes` list — requires session + existing profile, which is already true
by the time this page is reachable from either entry point below). No middleware changes
needed.

Two entry points:
- **Signup:** `app/signup/profile/page.tsx`'s `handleSave` redirects to `/ai-setup` instead of
  `/dashboard` after the profile insert succeeds.
- **Profile page, later:** `/profile` gets a new "AI Insights" card showing current
  `aiEnabled` status. If disabled, an "Enable AI Insights" button routes to
  `/ai-setup?returnTo=/profile`. Default `returnTo` (used by the signup entry point) is
  `/dashboard`.

The page has three internal states, driven by local component state (not separate URLs):

1. **Consent** — plain-language explanation that this uses AI (OpenRouter, an external model)
   to generate personalized workout suggestions from the user's profile and answers. Two
   actions: "Enable AI Insights" (→ Questionnaire) or "Not now" (→ redirect to `returnTo`,
   nothing written — `aiEnabled` stays at its default `false`).
2. **Questionnaire** — a form collecting:
   - Job type: Desk job (mostly sitting) / Physical labor / Mixed / Not currently working
   - Hours sitting per day: <2 / 2–4 / 4–6 / 6–8 / 8+
   - Commute activity: Sedentary (car/public transit) / Walk or bike
   - Current exercise frequency: None / 1–2x per week / 3–4x per week / 5+ per week
   - Primary goal focus: Lose weight / Build muscle / Improve stamina / General health /
     Athletic performance
   - Injuries or physical limitations (optional free text)
   - Preferred training days per week (3–6)

   On submit, calls `POST /api/ai/workout-plan` with these answers in the body. Shows a
   loading state while waiting.
3. **Preview & edit** — the generated 7-day plan rendered as an editable day/bodyPart grid,
   reusing the same day-selector + bodyPart-picker interaction pattern already used in
   `AddWorkoutModal` (`Push`/`Pull`/`Legs`/`Full Body`/`Cardio`/`Rest`). Actions:
   "Regenerate" (re-calls the API with the same answers), "Save Plan", "Cancel" (→ skip,
   nothing written).

   Only on **"Save Plan"** does anything get persisted, via the already-authenticated
   `createClientComponentClient` (matching the rest of the app's client-side write pattern):
   - `workout_plans`: upsert all 7 rows (`onConflict: 'profileId,dayOfWeek'`), each with
     `repeatWeekly: true`.
   - `profiles`: update `aiEnabled: true` and `lifestyle: {...answers}`.

   Then redirect to `returnTo`.

## AI generation backend

- **`lib/ai/openrouter.ts`** (server-only — never imported by a client component). Wraps the
  existing `openai` npm package pointed at OpenRouter:
  ```ts
  new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.NEXT_OPENROUTER_KEY,
  });
  ```
  Model id read from an env-configurable constant, defaulting to `openai/gpt-oss-120b:free`.
  Temperature low (~0.4) for consistent structured output. This replaces the current
  `lib/openai.ts`, which is unused dead code today (hardcodes `gpt-4` against OpenAI's own
  API, never imported anywhere).
- **`app/api/ai/workout-plan/route.ts`** (POST): auth-gated via `createRouteHandlerClient` +
  `auth.getUser()` (401 if no session — same pattern as
  `app/api/notifications/subscribe/route.ts`). Fetches the caller's own profile server-side
  (age/weight/height/activityLevel) — never trusts a client-supplied profile id. Takes
  lifestyle answers from the request body. Builds a system prompt that:
  - States the fixed output contract: exactly 7 entries, one per `dayOfWeek` 0–6 (Sun–Sat),
    each `bodyPart` one of `Push`/`Pull`/`Legs`/`Full Body`/`Cardio`/`Rest`.
  - Instructs the model to make the number of non-`Rest` days match the user's stated
    "preferred training days per week" answer (e.g. 4 → 4 training days + 3 `Rest` days),
    choosing which body parts to train and how to distribute them across the week.
  - Requests JSON-only output (no prose).
  - Includes profile + lifestyle answers as context.
- **Validation:** the route parses the model's response and validates: exactly 7 entries,
  all of `dayOfWeek` 0–6 present exactly once, `bodyPart` in the fixed set. Malformed output
  is treated as a failure — the client never receives invalid data.
- **The route only generates** — it does not write to the database. The client performs the
  actual save on explicit user confirmation (see Preview & edit above).

## Error handling & rate limits

- Transient failures (429/5xx from OpenRouter, timeout, JSON parse failure): the route
  performs one automatic retry before surfacing an error.
- If it still fails: the Questionnaire/Preview screen shows an error state with **"Try
  Again"** (re-submits) and **"Skip for now"** (routes to `returnTo`, nothing written — same
  outcome as declining consent).
- Nothing is ever auto-saved. The user always sees and confirms the generated plan before it
  touches `workout_plans` or `profiles`.

## Testing / verification

- `tsc --noEmit` clean.
- Manual browser verification (via a disposable test account, not the real user account):
  - Decline consent → lands on `/dashboard`, `profiles.aiEnabled` still `false`.
  - Accept → fill questionnaire → preview renders → edit one day → Save Plan → confirm all 7
    `workout_plans` rows + `profiles.aiEnabled`/`lifestyle` are written correctly via SQL →
    confirm `/session` reflects the new plan for at least one day.
  - Profile-page re-entry path: decline at signup, later enable via `/profile` →
    `/ai-setup?returnTo=/profile` → confirm redirect back to `/profile` on save.
  - Failure path: temporarily point the model id at an invalid value, confirm the
    retry/skip UI appears and confirm via SQL that nothing was written after Skip.
- Clean up all test data (test user, profile, workout_plans rows) after verification.

## Out of scope (future phases)

- Goals page AI generator (`/goals` sparkle button).
- Insights page AI summary banner.
- Session page AI scheduling guide popup.
- Dashboard AI motivation banner.

These will reuse `lib/ai/openrouter.ts` and the `aiEnabled`/`lifestyle` profile data once this
phase ships.
