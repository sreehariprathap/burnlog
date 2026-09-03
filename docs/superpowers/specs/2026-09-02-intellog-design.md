# IntelLog — Cross-App AI Intelligence System

## Problem

LogBook is 9+ siloed apps. Nothing today looks across all of them at once to
surface what a user should probably do next (a task, a workout, a lesson, an
investment move, a social nudge, a sell/buy suggestion, a trip idea) or how
they're doing relative to similar users. `lib/ai` exists but is used
per-app, one-shot (BurnLog onboarding program generation) — there is no
standing cross-app intelligence layer.

This spec covers a v1: a passive, nightly-generated suggestion feed, plus a
data layer (per-app snapshots + anonymized cohort benchmarks) that a future
cross-app chat assistant can reuse without rework.

## Goals

- Nightly per-profile suggestion feed spanning all apps (tasks, workouts,
  learning, investing, social, trip planning, sell/buy).
- Suggestions benchmarked against similar users' aggregate stats, without any
  AI call or UI ever seeing another user's raw data.
- Reuse existing `lib/ai` (OpenRouter client, `runAiJob` logging,
  `AiModelSetting`) rather than building a parallel AI stack.
- Data layer designed so a future chat assistant can query the same
  snapshot/cohort tables as retrieval context.

## Non-goals (v1)

- No interactive chat/assistant UI (confirmed with user — feed first, chat is
  a documented fast-follow).
- No opt-in comparison pools / named cohort groups — cohorts are automatic
  and coarse (goal type + age bucket), not user-facing.
- No per-suggestion-kind settings/config UI.
- No live/on-demand suggestion generation — nightly batch only.

## Privacy boundary

The AI never reads another user's raw rows. It reads:
1. The requesting profile's own `IntelSnapshot` rows (their own app data,
   pre-summarized into small metrics).
2. `IntelCohortStat` rows — aggregate percentiles only, published solely when
   the underlying cohort has `sampleSize >= 20`.

This split (snapshot = mine, cohort stat = aggregate-only, gated by minimum
sample size) is the privacy boundary for the whole system.

## Data model

New Prisma models, additive only:

```prisma
/// per-profile, per-app, per-day summary metrics — the only per-user data the AI reads
model IntelSnapshot {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId String   @db.Uuid
  app       String   // "burnlog" | "moneylog" | "tasklog" | "sociallog" | "travellog" | "learnlog" | "homelog" | "shoppinglog"
  date      DateTime @db.Date
  metrics   Json     // small flat object, app-specific, e.g. {"workoutsPerWeek": 4, "budgetPct": 82}
  createdAt DateTime @default(now())

  @@unique([profileId, app, date])
  @@index([profileId, date])
  @@map("intel_snapshots")
}

/// anonymized aggregate percentiles per cohort, published only when sampleSize >= 20
model IntelCohortStat {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cohortKey  String   // e.g. "goal:lose_weight|age:25-34"
  app        String
  metric     String   // matches a key inside IntelSnapshot.metrics
  date       DateTime @db.Date
  p25        Float
  p50        Float
  p75        Float
  sampleSize Int

  @@unique([cohortKey, app, metric, date])
  @@map("intel_cohort_stats")
}

/// AI-generated suggestion shown in the IntelLog feed
model IntelSuggestion {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String    @db.Uuid
  app         String    // target app the suggestion deep-links into
  kind        String    // "task" | "learn" | "workout" | "invest" | "social" | "trip" | "sell"
  title       String
  body        String
  deepLink    String
  status      String    @default("new") // "new" | "acted" | "dismissed" | "snoozed"
  createdAt   DateTime  @default(now())
  respondedAt DateTime?

  @@index([profileId, status, createdAt])
  @@map("intel_suggestions")
}
```

`Profile` gains inverse relations `intelSnapshots IntelSnapshot[]` and
`intelSuggestions IntelSuggestion[]`, matching the existing `AiJob` pattern.

Requires a `prisma migrate dev` migration.

## Jobs (nightly, reuses `worker/` cron pattern)

Three sequential stages, each idempotent via upsert on the unique keys above
— safe to re-run a full night's pipeline without duplicating rows.

1. **`intel:snapshot`** — per app, per profile. Each app owns its own
   extractor function, living next to that app's existing lib code (e.g.
   `lib/burnlog/intel.ts`, `lib/moneylog/intel.ts`), not centralized —
   only that app's code knows its own schema well enough to summarize it.
   Extractor signature: `(profileId, date) => Promise<Record<string, number>>`.
   Writes/upserts one `IntelSnapshot` row per app per profile per day.

2. **`intel:cohort`** — runs after all snapshots complete. Groups profiles
   into cohort keys (goal type + age bucket, derived from existing
   `Profile`/`FitnessGoal`/`FinancialGoal` fields), computes p25/p50/p75 per
   metric, and upserts `IntelCohortStat` rows — but only when
   `sampleSize >= 20`; smaller cohorts are skipped entirely (no row written,
   not even a low-confidence one).

3. **`intel:suggest`** — runs after cohort stats complete. Per profile:
   skips profiles with `<7` days of snapshot history. Otherwise assembles
   that profile's last 30 days of `IntelSnapshot` rows across all apps plus
   matching `IntelCohortStat` rows, and calls `lib/ai/openrouter.ts` wrapped
   in `runAiJob` (`app: "intellog"`, `jobType: "intel:suggest"`) with a
   structured-output prompt requesting a JSON array of suggestions matching
   `IntelSuggestion`'s shape (minus id/profileId/status/timestamps). Parses
   and validates the response; a malformed response is caught, logged as an
   `ai_jobs` error row (via `runAiJob`'s existing error path), and produces
   no suggestions for that profile that night — never surfaced to the user
   as a broken card. Model comes from existing `AiModelSetting` /
   `getModel(supabase, 'text')` — no new admin config.

## App surface: `app/(intellog)`

- Route `/intellog`, nav entry alongside the other `*Log` apps.
- Single feed page: suggestion cards grouped "New" / "Snoozed", each showing
  app icon, title, body, and three actions:
  - **Act** — deep-links into the source app via `deepLink`, sets
    `status: 'acted'`, `respondedAt: now()`.
  - **Dismiss** — sets `status: 'dismissed'`, `respondedAt: now()`.
  - **Snooze** — sets `status: 'snoozed'`; snoozed cards move to their own
    section and are excluded from "New" but not deleted.
- No settings/config UI in v1.
- Dismissed/acted status is included in the next night's `intel:suggest`
  prompt as light context ("previously dismissed: X, Y") so repeatedly
  ignored suggestion kinds taper off — simple prompt-level feedback, no
  separate preference-model needed for v1.

## Error handling

- Each job stage is independent per-profile/per-app; one profile's failure
  in `intel:suggest` doesn't block others (loop continues, logs, moves on).
- All three stages are upsert-based on their unique keys, so a full pipeline
  re-run after a partial failure just overwrites same-day rows — no
  duplicate-row cleanup logic needed.
- `runAiJob` already provides per-call success/error logging into `ai_jobs`,
  visible in the existing AI Jobs Log (Quick Glance) — no new observability
  surface needed for `intel:suggest` failures.

## Testing

- Unit test per app's `intel.ts` extractor: given fake rows for that app,
  assert expected `metrics` JSON.
- Unit test for cohort aggregation math (percentile calculation) and the
  `sampleSize >= 20` gate (cohort just under/over threshold).
- Mocked-OpenRouter test for the `intel:suggest` prompt-build → response-parse
  round-trip, including the malformed-response error path.
- No live/e2e AI calls in CI.

## Future (explicitly deferred, not built here)

- Cross-app AI chat assistant, reading the same `IntelSnapshot` /
  `IntelCohortStat` tables as retrieval context instead of (or alongside)
  nightly batch generation.
- Opt-in named comparison pools (see
  [[project_feature_brainstorm_2026-09-02]] cross-app idea #4 for the chat
  assistant, which this data layer is designed to support).
- Per-suggestion-kind on/off settings, if suggestions prove noisy.
