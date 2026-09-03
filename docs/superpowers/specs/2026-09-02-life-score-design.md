# Unified Life Score — Design

## Problem

LogBook's hub already computes a `dayScore` (`lib/logbook/today.ts`), but it
only averages 4 of 9 apps (BurnLog, TaskLog, MoneyLog, HomeLog), has no
history, no user control over what "score" means, and no way to compare with
friends. This is part of a broader push (see
`docs/superpowers/specs/` feature-brainstorm context, 2026-09-02) to make
LogBook feel like one platform with cross-app intelligence rather than nine
siloed apps. This spec generalizes the score to all apps, adds a
user-selectable scoring mode, history, and a SocialLog leaderboard entry.

## Goals

- Every enabled app contributes to a single daily score, not just 4.
- User can switch what the score measures: today's engagement, streak
  health, or goal progress — the ring updates immediately either way.
- 30-day trend chart of the score on the LogBook hub.
- Friends can compare via a new tab on SocialLog's existing leaderboard.

## Non-goals

- No cron/scheduled jobs — snapshots are computed lazily on read, same
  pattern the existing `computeYesterdayScore` already uses.
- No backfill of historical snapshots for existing users — trend chart
  simply has fewer points until snapshots accumulate.
- Leaderboard is not mode-configurable per viewer — always ranks by
  `engagementScore` for fairness (see Leaderboard section).

## Architecture

New module `lib/logbook/lifeScore.ts` holds a per-app adapter registry, one
function per app (`burnlog`, `tasklog`, `moneylog`, `homelog`, `sociallog`,
`shoppinglog`, `travellog`, `learnlog`, `adminlog` excluded — admin-only,
not part of a personal life score). Each adapter, given a `profileId` and a
day, returns three independent 0-100 values (or `null` if not applicable):

```ts
interface AppScoreDay {
  engagement: number | null; // did they touch this app today — 0 or 100
  streakPct: number | null;  // health of this app's own streak/XP concept
  goalPct: number | null;    // progress toward this app's active goal(s)
}
```

- `engagement` is derived per app from "was any row written today" (reuses
  each app's existing today-range queries already in `today.ts` and
  per-app card computations).
- `streakPct` reuses each app's own streak/XP system where one exists
  (BurnLog `ConsistencyTracker`, LearnLog skill streaks, etc.); apps
  without a native streak concept (ShoppingLog, HomeLog) return `null`.
- `goalPct` reuses the existing `card.pct` computations already built for
  BurnLog/TaskLog/MoneyLog/HomeLog in `today.ts`, and adds new equivalents
  for SocialLog, ShoppingLog, TravelLog, LearnLog (each app's own
  natural "progress" metric — e.g. TravelLog: active trip plan
  checklist completion; LearnLog: active skill/library goal progress).

The day's score for a given mode = average of that mode's non-null values,
filtered to only the apps in `profile.enabledApps` — the same
null-filtering/averaging shape `dayScore` already uses today, just applied
across all 9 apps and 3 possible modes instead of 4 apps and 1 mode.

## Data model

```prisma
model Profile {
  // ...existing fields
  lifeScoreMode String @default("engagement") // 'engagement' | 'streak' | 'goal'
}

/// One row per user per past day — written lazily, never for "today"
model LifeScoreSnapshot {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profileId        String   @db.Uuid
  date             DateTime @db.Date
  engagementScore  Int?
  streakScore      Int?
  goalScore        Int?
  createdAt        DateTime @default(now())

  profile Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, date])
  @@map("life_score_snapshots")
}
```

- All three mode scores are stored per row so a user switching
  `lifeScoreMode` later doesn't lose trend history for the mode they were
  on previously.
- Write path: when `getLogbookToday` runs and no `LifeScoreSnapshot` row
  exists for **yesterday**, compute all three mode scores for yesterday
  (using the same per-app adapters, run once for each mode) and insert the
  row. Today is never snapshotted — it's still in progress and read live.
- `@@unique([profileId, date])` makes the lazy-write idempotent (upsert).

## UI

- `DayScoreRing` (LogBook hub) gains a 3-way mode toggle (Today / Streak /
  Goal — maps to `lifeScoreMode`). Selecting a mode calls
  `PATCH /api/profile` to persist `lifeScoreMode` and re-renders the ring
  with that mode's live-computed value (today's score is always computed
  live, never read from a snapshot).
- New "Trend" section on the LogBook hub below the ring: a Recharts line
  chart reading up to the last 30 `LifeScoreSnapshot` rows, plotting
  whichever mode's column is currently active. Matches the existing
  per-app Insights chart styling.
- SocialLog leaderboard (`GET /api/social/leaderboard?metric=`) gets a new
  `metric=lifescore` option: friends + self ranked by each person's most
  recent `LifeScoreSnapshot.engagementScore` (always engagement, regardless
  of each user's personal `lifeScoreMode` — see Leaderboard section below).
  Reuses the existing tab-switcher UI pattern from the XP/Streak/Weekly
  tabs (`docs/superpowers/specs/2026-08-23-social-friends-leaderboard-design.md`).

## Leaderboard mode

Ranking always uses `engagementScore`, never each viewer's personal
`lifeScoreMode`. Rationale: streak/goal scores aren't comparable across
users whose apps and goals differ, but "did you touch your enabled apps
today" is a fair, universal comparison. Since snapshots already store all
three modes, this costs nothing extra — the leaderboard query just always
reads one fixed column.

## Error handling & edge cases

- App enabled but never used: adapter returns `null` for all three modes
  that day, excluded from the average — same behavior `dayScore` already
  has today for apps with no data.
- User has zero enabled apps with any data at all: score is `null` (ring
  shows the existing "—" empty state already used for `yesterdayScore`).
- New user / no snapshots yet: trend chart renders with however many
  points exist (possibly zero) — no synthetic backfill.
- Profile deleted: `LifeScoreSnapshot` rows cascade-delete via
  `onDelete: Cascade`, matching the existing cascade pattern noted in the
  leaderboard spec for `Friendship`.

## Testing

- Unit tests (vitest) for the averaging/filtering logic in
  `lifeScore.ts` — pure functions, no DB — following the existing
  `lib/adminlog/resolveToggle.test.ts` pattern: given a set of per-app
  `AppScoreDay` values and an `enabledApps` list, assert the correct
  filtered average per mode, and `null` when no components are available.
- Manual verification:
  - Switch `lifeScoreMode` on the hub ring, confirm the value changes to
    match the selected mode's computation.
  - Let a day pass, confirm a `LifeScoreSnapshot` row appears for
    yesterday with all three mode scores populated, and the trend chart
    picks it up.
  - Two test accounts, friends via existing SocialLog flow: confirm the
    new "Life Score" leaderboard tab ranks by `engagementScore` regardless
    of each account's own `lifeScoreMode` setting.
  - Disable an app in `/profile`, confirm its contribution drops out of
    the next day's snapshot and the score average.
