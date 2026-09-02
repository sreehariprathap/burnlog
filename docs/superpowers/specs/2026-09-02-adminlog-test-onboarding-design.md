# AdminLog Test Onboarding

## Problem

There's no safe way to exercise the real onboarding flow (signup → profile →
app selection → per-app wizards) without it writing to the admin's own real
profile and data. Admins need to QA the flow end-to-end — including its real
AI calls and real writes — without any risk to their own account, and see a
clear readout of everything the flow produced afterward.

## Goals

- Run the actual, unmodified onboarding wizards (BurnLog AI setup, MoneyLog,
  TaskLog, HomeLog, LearnLog) against a dedicated, resettable test identity.
- Never touch the admin's real profile or any other real user's data.
- After a run, show what was written: a raw per-table dump and a
  human-readable summary, in separate tabs.
- Let the admin reset the test identity back to blank and run again.

## Non-goals

- No changes to the 5 existing onboarding wizards' logic — they must run
  completely unmodified, authenticated as the test identity.
- Not multi-admin-concurrent-safe — a single shared test identity is enough;
  two admins running a test simultaneously would interfere with each other's
  run (acceptable for an internal QA tool).
- No automated/scripted answer-filling — the admin clicks through the wizard
  by hand, same as a real user would.

## Data model

One new field on `Profile`, in `prisma/schema.prisma`:

```prisma
model Profile {
  // ...existing fields...
  isTestAccount Boolean @default(false)
}
```

This is the safety anchor for every destructive operation this feature
performs: the reset/delete route (and the "is this really the test profile"
check before showing results) always requires `isTestAccount = true` on the
row being touched, in addition to matching by id. No code path deletes a
profile without that check.

Requires a `prisma migrate dev` migration, plus adding `isTestAccount` to
`supabase/rls.sql`'s existing `profiles` policies is **not** needed — it's
just a column, not a new table.

## Test identity

- Fixed, reserved email: `adminlog.test.onboarding@gmail.com` (configurable
  via `ADMINLOG_TEST_ONBOARDING_EMAIL` env var, defaulting to this value).
- Created lazily, once, via the service-role client
  (`supabase.auth.admin.createUser({ email, email_confirm: true })`), the
  first time "Enter Test Mode" is used. Idempotent — if the auth user
  already exists, reuse it.
- The `profiles` row for this auth user is **not** pre-created. Its absence
  is what makes the flow start at `/signup/profile`, exactly like a real
  new user. "Reset" (below) deletes the `profiles` row but keeps the
  `auth.users` row, so the next run reuses the same account and lands back
  at `/signup/profile` immediately.

## Session-swap mechanics

**Entering test mode** (button in AdminLog, e.g. on a new
`/adminlog/test-onboarding` page):

1. Client reads the admin's current session via
   `supabase.auth.getSession()` and stashes
   `{ access_token, refresh_token }` in `sessionStorage` under
   `adminlog:stashedSession`, plus `adminlog:testModeActive = "1"`.
2. Client calls `POST /api/adminlog/test-onboarding/start`. This route:
   - Verifies the caller is an admin using their **current** (real) session
     — this check must happen before any session swap, since afterward the
     browser is no longer authenticated as an admin.
   - Ensures the test auth user exists (service role, create-if-missing).
   - Calls `supabase.auth.admin.generateLink({ type: 'magiclink', email })`
     and returns its `token_hash` to the client. No password is ever
     stored or transmitted for the test account.
3. Client calls `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`,
   which swaps the browser's session (via the existing `@supabase/ssr`
   cookie handling) to the test account.
4. Client redirects to `/signup/profile`.

**Test-mode banner**: a small client component mounted once in the root
layout (`app/layout.tsx`), rendered whenever
`sessionStorage.getItem('adminlog:testModeActive') === "1"`. Shows "TEST
MODE — running as the onboarding test account" and an "Exit Test Mode"
button.

**Exiting test mode**:
1. Read `adminlog:stashedSession` from `sessionStorage`.
2. Call `supabase.auth.setSession({ access_token, refresh_token })` to
   restore the admin's real session.
3. Clear both `sessionStorage` keys.
4. Redirect to `/adminlog/test-onboarding`.

If the stashed session's access token has expired by the time the admin
exits (long test run), `setSession` transparently refreshes it using the
stashed refresh token — no special handling needed beyond what the
Supabase client already does.

## Results page: `/adminlog/test-onboarding`

Admin-gated (`useRequireAdmin`), same pattern as every other AdminLog page.

- "Enter Test Mode" button (only shown when not already in test mode).
- If a test profile currently exists (`profiles.isTestAccount = true`):
  render two tabs (shadcn `Tabs`, same primitive used elsewhere, e.g.
  `components/HeaderQuickInfo.tsx`):
  - **Raw data**: fetched from a new `GET /api/adminlog/test-onboarding`
    route (admin-gated, service role). Returns the test profile's row plus
    every row it owns across the tables the onboarding wizards can write to
    (`workout_plans`, `recurring_items`, `task_goals`, `tasklog_tasks`,
    `learnlog_skills`, `learnlog_career_goals`, `learnlog_library_items`,
    `household_chores`-adjacent rows if HomeLog was exercised, etc. — one
    query per table, keyed by the test profile's id, skipped/empty if that
    app wasn't onboarded this run). Rendered as one `<pre>` JSON block per
    non-empty table, matching the pattern in
    `components/logbook/AiJobsList.tsx`.
  - **Summary**: derived from the same fetched data, rendered as plain
    sentences per app that has any rows — e.g. "BurnLog: AI enabled,
    7-day plan generated.", "TaskLog: 1 goal, 3 tasks.", "MoneyLog: 2
    recurring items." An app with no rows for the test profile is omitted
    entirely (never onboarded, or reset since).
- "Reset test profile" button — calls
  `DELETE /api/adminlog/test-onboarding`, which:
  - Looks up the test profile by the reserved email, joined through
    `auth.users` → `profiles`.
  - **Hard-checks `isTestAccount = true`** before deleting anything — this
    is the one non-negotiable guardrail in this whole feature.
  - Deletes the `profiles` row. Tables with `onDelete: Cascade` on their
    `profileId` FK (most owner-loop tables per `supabase/rls.sql`) clean up
    automatically; check the actual FK definitions in `schema.prisma` for
    tables written by the 5 wizards and add any missing cascades needed for
    a full reset — implementation detail flagged for the plan.
  - Leaves the `auth.users` row intact for reuse.

## Testing

- `npm run build` passes after the migration + new routes/pages.
- Manually walk the full flow: Enter Test Mode → complete `/signup/profile`
  → `/onboarding/apps` (pick at least BurnLog + TaskLog) → both wizards →
  Exit Test Mode → confirm the admin's own session/profile is completely
  unaffected → open `/adminlog/test-onboarding` → confirm both tabs show
  the expected rows → Reset → confirm the test profile is gone and
  `isTestAccount` guard prevented any other row from being touched.
- Confirm a non-admin hitting any `/api/adminlog/test-onboarding*` route
  gets 403/401, both before and mid-test-mode (the route must check the
  *caller's* admin status server-side, not trust a client-side flag).
