# Scheduled Evening Check-In Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once daily (via Vercel Cron), automatically push a combined "Evening Check-In" notification to each subscribed user summarizing anything they haven't done today — no workout logged, a lagging daily goal, or an active streak at risk — skipping users who are already on track.

**Architecture:** Fix a latent schema bug (`PushSubscription.userId` wrongly `@unique`), extract the existing send-and-prune logic into a reusable `sendPushToUser()` helper, add a service-role Supabase client (needed because a cron job has no user session, so RLS-scoped queries would return nothing), add a pure message-composition function, and wire it all into a new cron-triggered route protected by a shared secret.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), Supabase (`@supabase/supabase-js` service-role client for the cron route, `@supabase/auth-helpers-nextjs` for the existing user-facing route), `web-push`, Prisma (`prisma db push`, no migrations directory), Vercel Cron (`vercel.json`).

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus hitting the cron route directly with `curl` using the correct/incorrect secret, and checking real push delivery on a subscribed device where practical.
- Schema changes go through `npx prisma db push` (no `prisma/migrations` directory in this repo).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be read from a client component or exposed via `NEXT_PUBLIC_*`. It is only ever used inside the new cron route (via `lib/supabase/serviceRole.ts`).
- Follow existing code style: Route Handlers use `NextResponse.json(...)`, errors are caught and logged via `console.error` before returning a JSON error body, camelCase Prisma-mapped columns (`profileId`, `caloriesBurned`, etc.) vs. snake_case on `push_subscriptions` (`user_id`, `subscription_data`) — that table predates the Prisma-mapped convention used elsewhere and keeps its existing column names.

---

### Task 1: Fix `PushSubscription.userId` unique constraint

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `push_subscriptions.user_id` is no longer a unique column at the DB level (only `endpoint` stays unique), matching the "one row per device" upsert logic already used by `app/api/notifications/subscribe/route.ts` and `PushNotificationPrompt.tsx`.

- [ ] **Step 1: Remove the incorrect `@unique`**

In `prisma/schema.prisma`, find the `PushSubscription` model (currently around line 138-145):

```prisma
model PushSubscription {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String   @unique @map("user_id") @db.Uuid
  subscriptionData Json     @map("subscription_data")
  createdAt        DateTime @default(now()) @map("created_at")
  endpoint         String   @unique

  @@map("push_subscriptions")
}
```

Change the `userId` line to remove `@unique`:

```prisma
model PushSubscription {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String   @map("user_id") @db.Uuid
  subscriptionData Json     @map("subscription_data")
  createdAt        DateTime @default(now()) @map("created_at")
  endpoint         String   @unique

  @@map("push_subscriptions")
}
```

- [ ] **Step 2: Push the schema change**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." (this drops the unique constraint on `user_id`).

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Verify via SQL**

Using the `mcp__supabase__execute_sql` tool:
```sql
select conname, contype from pg_constraint
where conrelid = 'push_subscriptions'::regclass;
```
Expected: an entry for the `endpoint` unique constraint and the primary key, but **no** unique constraint on `user_id` anymore.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "fix: allow multiple push_subscriptions rows per user (multi-device)"
```

---

### Task 2: Extract shared `sendPushToUser()` helper

**Files:**
- Create: `lib/pushNotification/server.ts`
- Modify: `app/api/notifications/send/route.ts`

**Interfaces:**
- Produces: `sendPushToUser(supabase: SupabaseClient, userId: string, payload: { title: string; message: string; url: string }): Promise<{ sent: number; pruned: number }>` — sends to every one of that user's `push_subscriptions` rows via `web-push`, deletes any that come back 404/410 (stale), and throws if VAPID keys aren't configured. Callable with either an RLS-scoped client (self-send) or a service-role client (cron, Task 4).

- [ ] **Step 1: Write the helper**

```ts
// lib/pushNotification/server.ts
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:sreehariprathap1996@gmail.com', vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = { title: string; message: string; url: string };

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Push notifications are not configured on the server');
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription_data')
    .eq('user_id', userId);

  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const notificationPayload = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subscriptions.map(async ({ endpoint, subscription_data }) => {
      try {
        await webpush.sendNotification(subscription_data, notificationPayload);
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
          pruned += 1;
        }
        console.error('Error sending notification:', err);
      }
    })
  );

  return { sent, pruned };
}
```

- [ ] **Step 2: Refactor the self-send route to use it**

Replace the full contents of `app/api/notifications/send/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, message, url } = body;

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sent } = await sendPushToUser(supabase, user.id, {
      title: title || 'burnlog Notification',
      message: message || 'You have a new notification',
      url: url || '/',
    });

    if (sent === 0) {
      return NextResponse.json({ success: false, message: 'No devices received the notification' }, { status: 404 });
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error('Server error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

This preserves the existing behavior `lib/pushNotification.ts`'s `sendRealTestNotification()` depends on: on failure it reads `body.error || body.message`, and both fields are still present in the relevant cases above.

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

With the dev server running and logged in as a user with an active push subscription, use the existing admin "Send Test Push" button (`/profile`) and confirm a real push notification still arrives on the device, exactly as before the refactor.

- [ ] **Step 4: Commit**

```bash
git add lib/pushNotification/server.ts app/api/notifications/send/route.ts
git commit -m "refactor: extract sendPushToUser helper from self-send route"
```

---

### Task 3: Service-role Supabase client

**Files:**
- Create: `lib/supabase/serviceRole.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `createServiceRoleClient(): SupabaseClient` — a Supabase client authenticated with the service-role key, bypassing RLS entirely. Throws if `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing.

- [ ] **Step 1: Write the client factory**

```ts
// lib/supabase/serviceRole.ts
import { createClient } from '@supabase/supabase-js';

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase service role client is not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Document the new env vars**

Append to `.env.example`:

```
# Server-only Supabase service role key (Project Settings > API > service_role).
# Bypasses RLS entirely — NEVER expose to the client or prefix with NEXT_PUBLIC_.
# Required by the evening-checkin cron job to read across all users.
SUPABASE_SERVICE_ROLE_KEY=

# Shared secret for the cron-triggered routes. Vercel Cron automatically sends
# this as `Authorization: Bearer <value>` when CRON_SECRET is set as a Vercel
# env var — generate any random string.
CRON_SECRET=
```

- [ ] **Step 3: Add the real values to `.env`**

This is a manual, one-time setup step (not scriptable — these are secrets):
1. In the Supabase dashboard: Project Settings → API → copy the `service_role` key → set `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
2. Generate a random string (e.g. `openssl rand -hex 32`) → set `CRON_SECRET` in `.env`.
3. When deploying, set both as environment variables in the Vercel project settings too (Vercel Cron reads `CRON_SECRET` from the project's env vars to build the `Authorization` header automatically).

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/serviceRole.ts .env.example
git commit -m "feat: add service-role Supabase client for server-only jobs"
```

(Do not commit `.env` itself — it's already gitignored.)

---

### Task 4: Check-in message composition

**Files:**
- Create: `lib/reminders/eveningCheckin.ts`

**Interfaces:**
- Consumes: `resolveTarget` from `lib/dailyTargets.ts`.
- Produces: `buildCheckinMessage(params): string | null` — a pure function, no I/O, easy to reason about independent of the cron route's data-fetching.

- [ ] **Step 1: Write the function**

```ts
// lib/reminders/eveningCheckin.ts
import { resolveTarget } from '@/lib/dailyTargets';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

type CheckinParams = {
  goals: Goal[];
  metrics: Metrics;
  hasWorkoutToday: boolean;
  hasAnyActivityToday: boolean;
  currentStreak: number;
};

const GOAL_CHECKS: { key: keyof Metrics; goalType: string; label: string }[] = [
  { key: 'steps', goalType: 'daily_steps', label: 'step goal' },
  { key: 'burn', goalType: 'calories_burned', label: 'calorie-burn goal' },
  { key: 'eat', goalType: 'calories_intake', label: 'calorie-intake goal' },
  { key: 'workoutMinutes', goalType: 'workout_time', label: 'workout-minutes goal' },
];

export function buildCheckinMessage(params: CheckinParams): string | null {
  const { goals, metrics, hasWorkoutToday, hasAnyActivityToday, currentStreak } = params;
  const lines: string[] = [];

  if (!hasWorkoutToday) {
    lines.push('No workout logged yet today');
  }

  for (const check of GOAL_CHECKS) {
    // Already covered by the "no workout" line above — avoid a redundant
    // "0% of your workout-minutes goal" line on the same notification.
    if (check.key === 'workoutMinutes' && !hasWorkoutToday) continue;

    const target = resolveTarget(goals, check.goalType);
    const value = metrics[check.key];
    if (target > 0 && value / target < 0.5) {
      const pct = Math.round((value / target) * 100);
      lines.push(`${pct}% of your ${check.label}`);
    }
  }

  if (currentStreak > 0 && !hasAnyActivityToday) {
    lines.push(`Your ${currentStreak}-day streak is at risk`);
  }

  if (lines.length === 0) return null;
  return lines.join(' · ');
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

As a quick sanity check (no test framework in this repo), temporarily run this in a scratch Node REPL or `ts-node` one-liner to confirm behavior on a couple of inputs:
```bash
npx ts-node -e "
import { buildCheckinMessage } from './lib/reminders/eveningCheckin';
console.log(buildCheckinMessage({ goals: [], metrics: { burn: 0, eat: 0, workoutMinutes: 0, steps: 100 }, hasWorkoutToday: false, hasAnyActivityToday: true, currentStreak: 0 }));
console.log(buildCheckinMessage({ goals: [], metrics: { burn: 900, eat: 1800, workoutMinutes: 30, steps: 8000 }, hasWorkoutToday: true, hasAnyActivityToday: true, currentStreak: 5 }));
"
```
Expected: first call prints a message mentioning the missing workout and low step %; second call prints `null` (fully on track).

- [ ] **Step 3: Commit**

```bash
git add lib/reminders/eveningCheckin.ts
git commit -m "feat: add evening check-in message composition"
```

---

### Task 5: Cron route + Vercel schedule

**Files:**
- Create: `app/api/cron/evening-checkin/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `createServiceRoleClient` (Task 3), `sendPushToUser` (Task 2), `buildCheckinMessage` (Task 4), `getTodayRange` (existing, `lib/dailyTargets.ts`).
- Produces: `GET /api/cron/evening-checkin` — `401` if the `Authorization` header doesn't match `Bearer ${CRON_SECRET}`; otherwise iterates every distinct `user_id` in `push_subscriptions`, sends a combined notification where warranted, and returns `{ sent, skipped, errors }`.

- [ ] **Step 1: Write the route**

```ts
// app/api/cron/evening-checkin/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';
import { buildCheckinMessage } from '@/lib/reminders/eveningCheckin';
import { getTodayRange } from '@/lib/dailyTargets';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { data: subRows, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id');

    if (subError) throw subError;

    const userIds = Array.from(new Set((subRows ?? []).map((r) => r.user_id as string)));
    const { start, end } = getTodayRange();

    for (const userId of userIds) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, currentStreak')
          .eq('userId', userId)
          .single();

        if (!profile) {
          skipped += 1;
          continue;
        }

        const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
          supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profile.id),
          supabase
            .from('calorie_burns')
            .select('caloriesBurned, duration')
            .eq('profileId', profile.id)
            .gte('date', start)
            .lt('date', end),
          supabase.from('food_intakes').select('calories').eq('profileId', profile.id).gte('date', start).lt('date', end),
          supabase.from('step_entries').select('steps').eq('profileId', profile.id).gte('date', start).lt('date', end),
        ]);

        const burnRows = (burnRes.data as { caloriesBurned: number; duration: number }[]) || [];
        const eatRows = (eatRes.data as { calories: number }[]) || [];
        const stepRows = (stepsRes.data as { steps: number }[]) || [];

        const metrics = {
          burn: burnRows.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0),
          eat: eatRows.reduce((sum, r) => sum + (r.calories || 0), 0),
          workoutMinutes: burnRows.reduce((sum, r) => sum + (r.duration || 0), 0),
          steps: stepRows.reduce((sum, r) => sum + (r.steps || 0), 0),
        };

        const hasWorkoutToday = burnRows.length > 0;
        const hasAnyActivityToday = hasWorkoutToday || metrics.eat > 0 || metrics.steps > 0;

        const message = buildCheckinMessage({
          goals: (goalsRes.data as { goalType: string; targetValue: number }[]) || [],
          metrics,
          hasWorkoutToday,
          hasAnyActivityToday,
          currentStreak: profile.currentStreak ?? 0,
        });

        if (!message) {
          skipped += 1;
          continue;
        }

        await sendPushToUser(supabase, userId, {
          title: 'Evening Check-In 🔥',
          message,
          url: '/dashboard',
        });
        sent += 1;
      } catch (perUserError) {
        console.error(`evening-checkin failed for user ${userId}:`, perUserError);
        errors += 1;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (error) {
    console.error('evening-checkin cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add the Vercel Cron schedule**

Create `vercel.json` at the repo root:

```json
{
  "crons": [
    { "path": "/api/cron/evening-checkin", "schedule": "0 20 * * *" }
  ]
}
```

(8pm UTC daily. No per-user timezone support in v1 — documented limitation, see the spec.)

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

With the dev server running and `CRON_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` set in `.env`:

```bash
# Unauthorized check
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/evening-checkin
# Expected: 401

# Authorized check
curl -s http://localhost:3000/api/cron/evening-checkin \
  -H "Authorization: Bearer $CRON_SECRET"
# Expected: 200 with {"sent": N, "skipped": M, "errors": 0}
```

For an end-to-end device check: pick a test profile with an active push subscription and `currentStreak > 0` with nothing logged today, run the authorized curl above, and confirm a real push notification arrives on the subscribed device with a message combining the missing-workout, lagging-goal, and streak-risk lines. Then log a workout and hit all 4 daily goals for that same profile, run it again, and confirm that profile is now skipped (no second notification).

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/evening-checkin/route.ts vercel.json
git commit -m "feat: add evening check-in cron route and Vercel schedule"
```
