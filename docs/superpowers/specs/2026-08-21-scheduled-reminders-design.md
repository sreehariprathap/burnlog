# Scheduled Evening Check-In Reminders — Design

## Problem

Push notifications today are fully built (subscribe → store → send → service-worker display → click-through) but 100% manual — the only sender is an admin "Send Test Push" button. There's no automatic trigger: no reminders, no goal-miss nudges, no streak warnings. Users get nothing unless someone manually fires a test push at them.

## Goals

- Once daily, automatically notify each subscribed user with a combined summary of what they haven't done yet today: no workout logged, behind on a daily goal, or an active streak at risk of breaking.
- Skip users who are already on track — no notification noise for people who've already logged everything.
- No new admin UI needed; this runs unattended via a scheduled job.

## Non-goals (v1)

- Per-user configurable reminder times — fixed system-wide time only (documented limitation: no user timezone is stored anywhere in the app today, so "8pm" is server UTC, not each user's local evening).
- Multiple daily notifications — everything is bundled into one combined evening check-in.

## Fixes bundled into this work

`PushSubscription.userId` is currently `@unique` in `prisma/schema.prisma`, which contradicts the "one row per device" upsert logic used by both `app/api/notifications/subscribe/route.ts` and `PushNotificationPrompt.tsx` (both `onConflict: 'endpoint'`). Left as-is, a second device registering for the same user would silently overwrite/conflict with the first device's subscription row at the DB level. Since this feature needs to reliably reach *all* of a user's devices, the `@unique` constraint on `userId` is removed (only `endpoint` stays unique).

## Shared send helper

Extract the send-and-prune logic currently inline in `app/api/notifications/send/route.ts` into `lib/pushNotification/server.ts`:

```ts
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; message: string; url: string }
): Promise<{ sent: number; pruned: number }>
```

Queries all of that user's rows in `push_subscriptions`, sends via `web-push` to each, and prunes any that come back 404/410 (stale endpoint) — same behavior the existing route has today, just made reusable. `app/api/notifications/send/route.ts` becomes a thin wrapper: resolve the caller's `userId`, call `sendPushToUser`. The new cron job calls it directly per target user.

## Cron endpoint

New route: `app/api/cron/evening-checkin/route.ts`.

- Auth: compares `request.headers.get('authorization')` against `` `Bearer ${process.env.CRON_SECRET}` `` — Vercel's standard cron-auth pattern (Vercel automatically attaches this header on cron-triggered invocations when `CRON_SECRET` is set as an env var). Mismatch → `401`, no processing.
- New `vercel.json` at the repo root, scheduling this route once daily:
  ```json
  {
    "crons": [
      { "path": "/api/cron/evening-checkin", "schedule": "0 20 * * *" }
    ]
  }
  ```
  (8pm UTC default — adjustable later; no per-user timezone support in v1, see Non-goals.)

For each **distinct `userId`** present in `push_subscriptions` (skip entirely if a user has zero subscription rows — no wasted queries):

Using the existing `getTodayRange()` from `lib/dailyTargets.ts` (server-side UTC day boundary, same helper the dashboard rings widget already uses client-side):

1. **Workout check** — any `calorie_burns` row for this user today? If none → trigger `"No workout logged yet today"`.
2. **Goal check** — for each of the 4 daily metrics (burn/eat/workout-minutes/steps), sum today's rows the same way `DailyRingsWidget` does, resolve the target via the existing `resolveTarget()` helper, and if `value / target < 0.5` → trigger a line naming it, e.g. `"20% of your step goal"`. (Multiple metrics can each trigger their own line.)
3. **Streak check** — `profiles.currentStreak > 0` AND zero rows today across `calorie_burns`, `food_intakes`, and `step_entries` combined → trigger `"Your {N}-day streak is at risk"`.

If none of the checks trigger for a user, skip them (no push sent). Otherwise, compose one combined notification:

```
title: "Evening Check-In 🔥"
message: triggered lines joined with " · " (a single line if only one triggered)
url: "/dashboard"
```

and call `sendPushToUser(supabase, userId, { title, message, url })`.

## Error handling & edge cases

- A `web-push` send failure for one user must not abort the batch — the loop continues; per-user errors are logged (`console.error`) with the `userId`, and the route still returns `200` with a summary: `{ sent: number, skipped: number, errors: number }`.
- `currentStreak = 0` users never get the streak line (only active streaks are "at risk").
- A user who has already logged everything (all 4 goals ≥ 50%, workout logged, streak fine) is skipped — this is the common case for engaged users and should never generate a notification.
- If `CRON_SECRET` is unset in the environment, the route should treat every request as unauthorized (fail closed, not open).

## Testing

No automated test suite exists in this repo. Manual verification:
- Seed/use a test profile with `currentStreak > 0` and no activity logged today; hit `/api/cron/evening-checkin` locally with the correct `Authorization: Bearer <CRON_SECRET>` header; confirm exactly one push arrives on the test device with a message mentioning the missing workout, the lagging goal(s), and the streak warning together.
- Log a workout + hit all 4 daily goals for that same test profile, then hit the route again; confirm the user is skipped (no second notification).
- Hit the route with a missing/incorrect `Authorization` header; confirm `401` and no pushes sent.
- Hit the route with zero subscribed users in the DB (or a fresh project); confirm it returns `200` with `sent: 0` and no errors.
