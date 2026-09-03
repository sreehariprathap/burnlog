# Unified Life Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LogBook's existing 4-app `dayScore` with a full 9-app score engine (excluding LogBook/AdminLog), switchable between three modes (engagement/streak/goal), with a 30-day trend chart and a SocialLog leaderboard tab.

**Architecture:** One new pure/DB-mixed module (`lib/logbook/lifeScore.ts`) holds per-app adapters and a pure averaging function. `lib/logbook/today.ts` calls it for today's live score and lazily upserts a `LifeScoreSnapshot` row for yesterday the first time it's requested. A new trend API route reads snapshot history; a new SocialLog leaderboard route reads friends' snapshots.

**Tech Stack:** Next.js 15 App Router API routes, Prisma/Postgres via Supabase, Recharts, vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-life-score-design.md`

## Global Constraints

- `LifeScoreSnapshot` covers exactly the 8 personal apps: `burnlog`, `tasklog`, `moneylog`, `homelog`, `sociallog`, `shoppinglog`, `travellog`, `learnlog`. `logbook` and `adminlog` are never scored.
- Only apps in `profile.enabledApps` contribute to a user's score that day.
- Streak formula (documented, used everywhere a streak exists): `streakPct = Math.min(100, currentStreak * 10)` — a 10-day streak = 100%.
- Today's score is always computed live, never read from a snapshot. Snapshots exist only for past days.
- The SocialLog leaderboard always ranks by `engagementScore`, regardless of each user's personal `lifeScoreMode`.
- No cron jobs. All writes are lazy, triggered by a read.

---

### Task 1: Prisma schema — `lifeScoreMode` + `LifeScoreSnapshot`

**Files:**
- Modify: `prisma/schema.prisma` (Profile model, ~line 39; add new model near `Friendship`, ~line 573)

**Interfaces:**
- Produces: `Profile.lifeScoreMode: string` (default `"engagement"`), `LifeScoreSnapshot` table `life_score_snapshots` with columns `profileId`, `date`, `engagementScore`, `streakScore`, `goalScore`.

- [ ] **Step 1: Add `lifeScoreMode` to `Profile`**

In `prisma/schema.prisma`, inside `model Profile { ... }`, add after the `learnLogAiEnabled` field (line 47):

```prisma
  lifeScoreMode            String    @default("engagement") // 'engagement' | 'streak' | 'goal'
```

- [ ] **Step 2: Add the `LifeScoreSnapshot` model**

Add this new model directly after the `Friendship` model (after line 573, before the `SocialPost` comment):

```prisma
/// one row per user per past day — written lazily the first time that day
/// is asked for as "yesterday"; today is always computed live, never stored
model LifeScoreSnapshot {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId       String   @db.Uuid
  date            DateTime @db.Date
  engagementScore Int?
  streakScore     Int?
  goalScore       Int?
  createdAt       DateTime @default(now())

  @@unique([profileId, date])
  @@map("life_score_snapshots")
}
```

Also add the back-relation field to `Profile` (alongside its other list relations, e.g. near `FitnessGoal FitnessGoal[]` at line 49):

```prisma
  LifeScoreSnapshot LifeScoreSnapshot[]
```

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name add_life_score
```

Expected: a new folder under `prisma/migrations/` is created, and it applies cleanly against the local/dev database with no errors.

- [ ] **Step 4: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: completes with no errors (this repo also uses the Supabase JS client directly for most queries, but Prisma client generation must stay in sync with the schema).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(logbook): add lifeScoreMode and LifeScoreSnapshot"
```

---

### Task 2: `lifeScore.ts` — types and pure averaging logic (TDD)

**Files:**
- Create: `lib/logbook/lifeScore.ts`
- Test: `lib/logbook/lifeScore.test.ts`

**Interfaces:**
- Consumes: `AppId` from `@/lib/appMode`.
- Produces: `LifeScoreApp` type, `AppScoreDay` interface, `LifeScoreMode` type, `averageMode(dayScores: Partial<Record<LifeScoreApp, AppScoreDay>>, mode: LifeScoreMode, enabledApps: LifeScoreApp[]): number | null` — the exact name/signature every later task calls.

- [ ] **Step 1: Write the failing test**

Create `lib/logbook/lifeScore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { averageMode, type AppScoreDay, type LifeScoreApp } from './lifeScore';

const full: AppScoreDay = { engagement: 100, streakPct: 80, goalPct: 60 };
const zero: AppScoreDay = { engagement: 0, streakPct: 0, goalPct: 0 };
const empty: AppScoreDay = { engagement: null, streakPct: null, goalPct: null };

describe('averageMode', () => {
  it('averages the engagement values of enabled apps only', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, tasklog: zero, moneylog: full };
    expect(averageMode(day, 'engagement', ['burnlog', 'tasklog'])).toBe(50);
  });

  it('excludes apps not in enabledApps even if their score exists', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, moneylog: zero };
    expect(averageMode(day, 'engagement', ['burnlog'])).toBe(100);
  });

  it('excludes apps with a null value for the requested mode', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full, sociallog: empty };
    expect(averageMode(day, 'goal', ['burnlog', 'sociallog'])).toBe(60);
  });

  it('returns null when no enabled app has a non-null value for the mode', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { sociallog: empty, shoppinglog: empty };
    expect(averageMode(day, 'streak', ['sociallog', 'shoppinglog'])).toBeNull();
  });

  it('returns null when enabledApps is empty', () => {
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: full };
    expect(averageMode(day, 'engagement', [])).toBeNull();
  });

  it('rounds the average to the nearest integer', () => {
    const a: AppScoreDay = { engagement: 100, streakPct: null, goalPct: null };
    const b: AppScoreDay = { engagement: 0, streakPct: null, goalPct: null };
    const c: AppScoreDay = { engagement: 34, streakPct: null, goalPct: null };
    const day: Partial<Record<LifeScoreApp, AppScoreDay>> = { burnlog: a, tasklog: b, moneylog: c };
    expect(averageMode(day, 'engagement', ['burnlog', 'tasklog', 'moneylog'])).toBe(45); // (100+0+34)/3 = 44.67 -> 45
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/logbook/lifeScore.test.ts`
Expected: FAIL — `lifeScore.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/logbook/lifeScore.ts`:

```ts
// lib/logbook/lifeScore.ts
import type { AppId } from '@/lib/appMode';

export type LifeScoreApp = Exclude<AppId, 'logbook' | 'adminlog'>;

export const LIFE_SCORE_APPS: LifeScoreApp[] = [
  'burnlog',
  'tasklog',
  'moneylog',
  'homelog',
  'sociallog',
  'shoppinglog',
  'travellog',
  'learnlog',
];

export type LifeScoreMode = 'engagement' | 'streak' | 'goal';

export interface AppScoreDay {
  engagement: number | null; // 0 or 100 — did they touch this app today
  streakPct: number | null;  // Math.min(100, currentStreak * 10), or null if no streak concept
  goalPct: number | null;    // progress toward this app's natural goal, or null if none
}

const MODE_KEY: Record<LifeScoreMode, keyof AppScoreDay> = {
  engagement: 'engagement',
  streak: 'streakPct',
  goal: 'goalPct',
};

/**
 * Average one mode's values across enabled apps, skipping apps with no
 * value for that mode. Null if no enabled app has a value.
 */
export function averageMode(
  dayScores: Partial<Record<LifeScoreApp, AppScoreDay>>,
  mode: LifeScoreMode,
  enabledApps: LifeScoreApp[]
): number | null {
  const key = MODE_KEY[mode];
  const values = enabledApps
    .map((app) => dayScores[app]?.[key])
    .filter((v): v is number => v !== null && v !== undefined);

  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function streakToPct(currentStreak: number): number {
  return Math.min(100, currentStreak * 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/logbook/lifeScore.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/logbook/lifeScore.ts lib/logbook/lifeScore.test.ts
git commit -m "feat(logbook): add life score averaging engine"
```

---

### Task 3: `lifeScore.ts` — per-app DB adapters

**Files:**
- Modify: `lib/logbook/lifeScore.ts`

**Interfaces:**
- Consumes: `AppScoreDay`, `streakToPct` from Task 2; `getTodayRange`, `resolveTarget`, `DEFAULT_TARGETS` from `@/lib/dailyTargets`; `getPeriodRange`, `expandRecurringInRange`, `RecurringItemRow` from `@/lib/financePeriods`; `getMyHouseholdMembership` from `@/lib/homelog/serverAuth`; `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `computeAppScoresForDay(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<Record<LifeScoreApp, AppScoreDay>>` — every later task that needs a day's per-app breakdown calls this one function.

- [ ] **Step 1: Add the per-app adapter functions and the combining function**

Append to `lib/logbook/lifeScore.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodRange, expandRecurringInRange, type RecurringItemRow } from '@/lib/financePeriods';
import { resolveTarget, DEFAULT_TARGETS } from '@/lib/dailyTargets';
import { getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

const DAY_MS = 24 * 60 * 60 * 1000;

async function scoreBurnlog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [goalsRes, burnRes, foodRes, profileRes] = await Promise.all([
    supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
    supabase.from('calorie_burns').select('caloriesBurned').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
    supabase.from('food_intakes').select('id').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
    supabase.from('profiles').select('currentStreak').eq('id', profileId).single(),
  ]);

  const goals = (goalsRes.data as { goalType: string; targetValue: number }[]) || [];
  const target = resolveTarget(goals, 'calories_burned') || DEFAULT_TARGETS.calories_burned;
  const burned = ((burnRes.data as { caloriesBurned: number }[]) || []).reduce((s, r) => s + (r.caloriesBurned || 0), 0);
  const touchedToday = burned > 0 || ((foodRes.data as unknown[]) || []).length > 0;
  const currentStreak = (profileRes.data as { currentStreak: number } | null)?.currentStreak ?? 0;

  return {
    engagement: touchedToday ? 100 : 0,
    streakPct: streakToPct(currentStreak),
    goalPct: target > 0 ? Math.min(100, Math.round((burned / target) * 100)) : null,
  };
}

async function scoreTasklog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }, dayStr: string): Promise<AppScoreDay> {
  const [taskRes, profileRes] = await Promise.all([
    supabase.from('tasklog_tasks').select('id, completedAt').eq('profileId', profileId).or(`dueDate.eq.${dayStr},plannedForToday.eq.true`),
    supabase.from('profiles').select('taskLogCurrentStreak').eq('id', profileId).single(),
  ]);

  const rows = (taskRes.data as { id: string; completedAt: string | null }[]) || [];
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;
  const currentStreak = (profileRes.data as { taskLogCurrentStreak: number } | null)?.taskLogCurrentStreak ?? 0;

  return {
    engagement: completed > 0 ? 100 : 0,
    streakPct: streakToPct(currentStreak),
    goalPct: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

async function scoreMoneylog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const monthRange = getPeriodRange('monthly');
  const [recurringRes, txRes] = await Promise.all([
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
    supabase.from('finance_transactions').select('type, amount').eq('profileId', profileId).gte('date', range.start).lt('date', range.end),
  ]);

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  const monthlyExpenseItems = expandRecurringInRange(recurringItems, monthRange.start, monthRange.end).filter((i) => i.type === 'expense');
  const monthlyExpenseTotal = monthlyExpenseItems.reduce((s, i) => s + i.amount, 0);
  const daysInMonth = Math.round((monthRange.end.getTime() - monthRange.start.getTime()) / DAY_MS) || 30;
  const dailyBudget = monthlyExpenseTotal > 0 ? monthlyExpenseTotal / daysInMonth : 0;

  const txRows = (txRes.data as { type: string; amount: number }[]) || [];
  const spentToday = txRows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return {
    engagement: txRows.length > 0 ? 100 : 0,
    streakPct: null,
    goalPct: dailyBudget > 0 ? Math.max(0, Math.min(100, Math.round(((dailyBudget - spentToday) / dailyBudget) * 100))) : null,
  };
}

async function scoreHomelog(supabase: SupabaseClient, profileId: string, dayStr: string): Promise<AppScoreDay> {
  const membership = await getMyHouseholdMembership(supabase, profileId);
  if (!membership) return { engagement: null, streakPct: null, goalPct: null };

  const { data } = await supabase
    .from('household_chore_instances')
    .select('id, completedAt')
    .eq('assignedProfileId', profileId)
    .eq('dueDate', dayStr);

  const rows = (data as { id: string; completedAt: string | null }[]) || [];
  const total = rows.length;
  const completed = rows.filter((r) => r.completedAt).length;

  return {
    engagement: completed > 0 ? 100 : 0,
    streakPct: null,
    goalPct: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

async function scoreSociallog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [postRes, msgRes] = await Promise.all([
    supabase.from('social_posts').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('social_messages').select('id').eq('senderId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
  ]);

  const touchedToday = ((postRes.data as unknown[]) || []).length > 0 || ((msgRes.data as unknown[]) || []).length > 0;

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct: null };
}

async function scoreShoppinglog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [orderRes, listingRes] = await Promise.all([
    supabase.from('shop_orders').select('id').or(`buyerId.eq.${profileId},sellerId.eq.${profileId}`).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('shop_listings').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
  ]);

  const touchedToday = ((orderRes.data as unknown[]) || []).length > 0 || ((listingRes.data as unknown[]) || []).length > 0;

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct: null };
}

async function scoreTravellog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [visitRes, planRes] = await Promise.all([
    supabase.from('travellog_visits').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('travellog_plans').select('id').eq('profileId', profileId).eq('status', 'accepted').order('createdAt', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const touchedToday = ((visitRes.data as unknown[]) || []).length > 0;

  let goalPct: number | null = null;
  const activePlan = planRes.data as { id: string } | null;
  if (activePlan) {
    const { data: taskRows } = await supabase.from('tasklog_tasks').select('id, completedAt').eq('travelPlanId', activePlan.id);
    const rows = (taskRows as { id: string; completedAt: string | null }[]) || [];
    if (rows.length > 0) {
      goalPct = Math.round((rows.filter((r) => r.completedAt).length / rows.length) * 100);
    }
  }

  return { engagement: touchedToday ? 100 : 0, streakPct: null, goalPct };
}

async function scoreLearnlog(supabase: SupabaseClient, profileId: string, range: { start: string; end: string }): Promise<AppScoreDay> {
  const [sessionRes, reflectionRes, skillsRes, inProgressRes] = await Promise.all([
    supabase.from('learnlog_skill_sessions').select('id, skillId').gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('learnlog_reflections').select('id').eq('profileId', profileId).gte('createdAt', range.start).lt('createdAt', range.end),
    supabase.from('learnlog_skills').select('id, currentStreak').eq('profileId', profileId),
    supabase.from('learnlog_library_items').select('progressPercent').eq('profileId', profileId).eq('status', 'IN_PROGRESS'),
  ]);

  // SkillSession has no profileId column — filter sessions to this profile's skills.
  const mySkillIds = new Set((((skillsRes.data as { id?: string }[]) || [])).map((s) => s.id));
  const sessionRows = (sessionRes.data as { id: string; skillId: string }[]) || [];
  const touchedViaSession = sessionRows.some((r) => mySkillIds.has(r.skillId));
  const touchedToday = touchedViaSession || ((reflectionRes.data as unknown[]) || []).length > 0;

  const streaks = ((skillsRes.data as { currentStreak: number }[]) || []).map((s) => s.currentStreak);
  const streakPct = streaks.length > 0 ? Math.round(streaks.reduce((s, v) => s + streakToPct(v), 0) / streaks.length) : null;

  const inProgress = (inProgressRes.data as { progressPercent: number }[]) || [];
  const goalPct = inProgress.length > 0 ? Math.round(inProgress.reduce((s, i) => s + i.progressPercent, 0) / inProgress.length) : null;

  return { engagement: touchedToday ? 100 : 0, streakPct, goalPct };
}

/**
 * Compute every enabled-relevant app's score for one day in parallel.
 * Callers filter by profile.enabledApps via averageMode — this always
 * computes all 8 apps since most queries are cheap and app-enablement
 * can change between reads.
 */
export async function computeAppScoresForDay(
  supabase: SupabaseClient,
  profileId: string,
  range: { start: string; end: string },
  dayStr: string
): Promise<Record<LifeScoreApp, AppScoreDay>> {
  const [burnlog, tasklog, moneylog, homelog, sociallog, shoppinglog, travellog, learnlog] = await Promise.all([
    scoreBurnlog(supabase, profileId, range),
    scoreTasklog(supabase, profileId, range, dayStr),
    scoreMoneylog(supabase, profileId, range),
    scoreHomelog(supabase, profileId, dayStr),
    scoreSociallog(supabase, profileId, range),
    scoreShoppinglog(supabase, profileId, range),
    scoreTravellog(supabase, profileId, range),
    scoreLearnlog(supabase, profileId, range),
  ]);

  return { burnlog, tasklog, moneylog, homelog, sociallog, shoppinglog, travellog, learnlog };
}
```

- [ ] **Step 2: Verify existing unit tests still pass (no DB code is exercised by them)**

Run: `npx vitest run lib/logbook/lifeScore.test.ts`
Expected: PASS (Task 2's tests are unaffected — this task only adds new exports).

- [ ] **Step 3: Manual verification**

Add a temporary script or use `tsx`/Node REPL against a dev Supabase instance to call `computeAppScoresForDay` for your own `profileId` and today's date range (from `getTodayRange()` in `@/lib/dailyTargets`), confirm it returns 8 keys with plausible values (no thrown errors, `engagement` is 0 or 100 for every app). Delete the temporary script afterward — do not commit it.

- [ ] **Step 4: Commit**

```bash
git add lib/logbook/lifeScore.ts
git commit -m "feat(logbook): add per-app life score adapters"
```

---

### Task 4: `lifeScore.ts` — snapshot upsert and trend read

**Files:**
- Modify: `lib/logbook/lifeScore.ts`

**Interfaces:**
- Consumes: `computeAppScoresForDay`, `averageMode`, `LIFE_SCORE_APPS` from Task 3/2.
- Produces: `getOrCreateSnapshotForDate(supabase: SupabaseClient, profileId: string, date: string, enabledApps: LifeScoreApp[]): Promise<{ date: string; engagementScore: number | null; streakScore: number | null; goalScore: number | null }>`, `getLifeScoreTrend(supabase: SupabaseClient, profileId: string, days?: number): Promise<Array<{ date: string; engagementScore: number | null; streakScore: number | null; goalScore: number | null }>>`.

- [ ] **Step 1: Add snapshot and trend functions**

Append to `lib/logbook/lifeScore.ts`:

```ts
import { format as formatDate, subDays } from 'date-fns';

function rangeForDate(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = subDays(start, -1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Lazily compute-and-store a snapshot for a past date (never "today").
 * Idempotent via the profileId+date unique constraint.
 */
export async function getOrCreateSnapshotForDate(
  supabase: SupabaseClient,
  profileId: string,
  date: string,
  enabledApps: LifeScoreApp[]
) {
  const { data: existing } = await supabase
    .from('life_score_snapshots')
    .select('date, engagementScore, streakScore, goalScore')
    .eq('profileId', profileId)
    .eq('date', date)
    .maybeSingle();

  if (existing) return existing;

  const range = rangeForDate(date);
  const dayScores = await computeAppScoresForDay(supabase, profileId, range, date);

  const engagementScore = averageMode(dayScores, 'engagement', enabledApps);
  const streakScore = averageMode(dayScores, 'streak', enabledApps);
  const goalScore = averageMode(dayScores, 'goal', enabledApps);

  const { data: inserted, error } = await supabase
    .from('life_score_snapshots')
    .upsert(
      { profileId, date, engagementScore, streakScore, goalScore },
      { onConflict: 'profileId,date' }
    )
    .select('date, engagementScore, streakScore, goalScore')
    .single();

  if (error) throw error;
  return inserted;
}

export async function getLifeScoreTrend(supabase: SupabaseClient, profileId: string, days = 30) {
  const since = formatDate(subDays(new Date(), days), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('life_score_snapshots')
    .select('date, engagementScore, streakScore, goalScore')
    .eq('profileId', profileId)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data as Array<{ date: string; engagementScore: number | null; streakScore: number | null; goalScore: number | null }>) || [];
}
```

- [ ] **Step 2: Manual verification**

Using the same manual-verification approach as Task 3, call `getOrCreateSnapshotForDate` for yesterday's date with your own `profileId`, confirm a row appears in `life_score_snapshots` (check via Supabase dashboard or `execute_sql`), and calling it a second time returns the same row without a duplicate insert.

- [ ] **Step 3: Commit**

```bash
git add lib/logbook/lifeScore.ts
git commit -m "feat(logbook): add life score snapshot upsert and trend read"
```

---

### Task 5: Wire the engine into `getLogbookToday`

**Files:**
- Modify: `lib/logbook/today.ts:429-470` (the `getLogbookToday` function and the old `computeYesterdayScore`)

**Interfaces:**
- Consumes: `computeAppScoresForDay`, `averageMode`, `getOrCreateSnapshotForDate`, `LIFE_SCORE_APPS`, `LifeScoreApp`, `LifeScoreMode` from `./lifeScore`.
- Produces: `LogbookToday.dayScore` and `LogbookToday.yesterdayScore` now reflect the full 9-app engine (same field names/types — no downstream consumer needs to change), plus a new `LogbookToday.lifeScoreMode: LifeScoreMode` field.

- [ ] **Step 1: Replace `computeYesterdayScore` and the `dayScore` calculation**

In `lib/logbook/today.ts`, delete the old `computeYesterdayScore` function (lines 48-69) and update `getLogbookToday`:

```ts
import {
  computeAppScoresForDay,
  averageMode,
  getOrCreateSnapshotForDate,
  LIFE_SCORE_APPS,
  type LifeScoreApp,
  type LifeScoreMode,
} from './lifeScore';

// ... (dayKey, DAY_MS, getYesterdayRange stay as-is)

export interface LogbookToday {
  dayScore: number | null;
  yesterdayScore: number | null;
  lifeScoreMode: LifeScoreMode;
  cards: LogbookCard[];
  streak: number;
  streakApps: string[];
  insight: string;
  activity: LogbookActivityEvent[];
}

export async function getLogbookToday(supabase: SupabaseClient, profileId: string): Promise<LogbookToday> {
  const today = dayKey(new Date());

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('enabledApps, lifeScoreMode')
    .eq('id', profileId)
    .single();

  const enabledApps = (((profileRow as { enabledApps: string[] } | null)?.enabledApps) || []).filter(
    (a): a is LifeScoreApp => LIFE_SCORE_APPS.includes(a as LifeScoreApp)
  );
  const lifeScoreMode = ((profileRow as { lifeScoreMode: LifeScoreMode } | null)?.lifeScoreMode) || 'engagement';

  const { start: todayStart, end: todayEnd } = getTodayRange();
  const { start: yesterdayStart, end: yesterdayEnd } = getYesterdayRange();
  const yesterdayStr = dayKey(yesterdayStart);

  const [burnlog, tasklog, moneylog, homelog, sociallog, shoppinglog, streakInfo, activity, todayAppScores, yesterdaySnapshot] =
    await Promise.all([
      computeBurnlogCard(supabase, profileId),
      computeTasklogCard(supabase, profileId, today),
      computeMoneylogCard(supabase, profileId),
      computeHomelogCard(supabase, profileId, today),
      computeSociallogCard(supabase, profileId),
      computeShoppinglogCard(supabase, profileId),
      computeStreak(supabase, profileId),
      computeActivity(supabase, profileId),
      computeAppScoresForDay(supabase, profileId, { start: todayStart, end: todayEnd }, today),
      enabledApps.length > 0
        ? getOrCreateSnapshotForDate(supabase, profileId, yesterdayStr, enabledApps)
        : Promise.resolve(null),
    ]);

  const dayScore = averageMode(todayAppScores, lifeScoreMode, enabledApps);
  const yesterdayScore =
    lifeScoreMode === 'engagement'
      ? yesterdaySnapshot?.engagementScore ?? null
      : lifeScoreMode === 'streak'
      ? yesterdaySnapshot?.streakScore ?? null
      : yesterdaySnapshot?.goalScore ?? null;

  const insight = buildInsight({
    burnedToday: burnlog.burnedToday,
    tasksCompleted: tasklog.completed,
    tasksTotal: tasklog.total,
    spentToday: moneylog.spentToday,
    dailyBudget: moneylog.card.target,
    streak: streakInfo.streak,
  });

  return {
    dayScore,
    yesterdayScore,
    lifeScoreMode,
    cards: [burnlog.card, tasklog.card, moneylog.card, homelog.card, sociallog.card, shoppinglog.card],
    streak: streakInfo.streak,
    streakApps: streakInfo.streakApps,
    insight,
    activity,
  };
}
```

`getTodayRange` is already imported at the top of the file (line 5); no new import needed for it.

- [ ] **Step 2: Manual verification**

Run `npm run dev`, log in, visit `/logbook`. Confirm the page loads without error and the score ring shows a value consistent with your enabled apps (compare against the old 4-app calculation mentally — it should now factor in more apps if you have more than 4 enabled).

- [ ] **Step 3: Commit**

```bash
git add lib/logbook/today.ts
git commit -m "feat(logbook): wire life score engine into getLogbookToday"
```

---

### Task 6: Trend API route

**Files:**
- Create: `app/api/logbook/life-score-trend/route.ts`

**Interfaces:**
- Consumes: `getLifeScoreTrend` from `@/lib/logbook/lifeScore`, `getMyProfileId` from `@/lib/homelog/serverAuth` (already used in `app/api/logbook/today/route.ts`).
- Produces: `GET /api/logbook/life-score-trend` → `{ trend: Array<{ date: string; engagementScore: number | null; streakScore: number | null; goalScore: number | null }> }`.

- [ ] **Step 1: Write the route**

```ts
// app/api/logbook/life-score-trend/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getLifeScoreTrend } from '@/lib/logbook/lifeScore';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const trend = await getLifeScoreTrend(admin, profileId, 30);
    return NextResponse.json({ trend });
  } catch (error) {
    console.error('life-score-trend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

With the dev server running and logged in, `curl` the route with your session cookie (or hit it from the browser at `/api/logbook/life-score-trend` while logged in) and confirm it returns `{ "trend": [...] }` (an empty array is fine for a fresh account).

- [ ] **Step 3: Commit**

```bash
git add app/api/logbook/life-score-trend/route.ts
git commit -m "feat(logbook): add life score trend API route"
```

---

### Task 7: `DayScoreRing` mode toggle

**Files:**
- Modify: `components/logbook/DayScoreRing.tsx`
- Modify: `app/(logbook)/logbook/page.tsx:114-116`

**Interfaces:**
- Consumes: `LifeScoreMode` from `@/lib/logbook/lifeScore`; `createClient` from `@/lib/supabase/client` (same pattern as `components/ProfilePage.tsx`).
- Produces: `DayScoreRing` now takes `mode: LifeScoreMode`, `onModeChange: (mode: LifeScoreMode) => void` props in addition to `score`.

- [ ] **Step 1: Update `DayScoreRing`**

```tsx
// components/logbook/DayScoreRing.tsx
import { StatRing } from '@/components/ui/stat-ring';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';

interface DayScoreRingProps {
  score: number | null;
  mode: LifeScoreMode;
  onModeChange: (mode: LifeScoreMode) => void;
}

const MODES: { id: LifeScoreMode; label: string }[] = [
  { id: 'engagement', label: 'Today' },
  { id: 'streak', label: 'Streak' },
  { id: 'goal', label: 'Goal' },
];

function scoreLabel(score: number): string {
  if (score >= 85) return 'Crushing it';
  if (score >= 60) return 'On track';
  if (score >= 30) return 'Getting started';
  return 'Just beginning';
}

export function DayScoreRing({ score, mode, onModeChange }: DayScoreRingProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <StatRing value={score ?? 0} size="lg" className="text-4xl" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Score</span>
      <p className="text-sm font-medium text-muted-foreground">
        {score === null ? 'Log something to get your score' : scoreLabel(score)}
      </p>
      <div className="mt-1 flex gap-1 rounded-full border border-white/10 bg-background/40 p-1">
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onModeChange(m.id)}
            className={cn(
              'h-7 rounded-full px-3 text-xs',
              mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {m.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it up in the LogBook page**

In `app/(logbook)/logbook/page.tsx`, add imports and a handler, and replace the `DayScoreRing` usage:

```tsx
import { createClient } from '@/lib/supabase/client';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';
```

Inside `LogbookPage`, add near the other hooks (after `const { toast } = useToast();`):

```tsx
  const supabase = createClient();

  async function handleModeChange(mode: LifeScoreMode) {
    if (!profile || !data) return;
    await mutate({ ...data, dayScore: data.dayScore, lifeScoreMode: mode }, false); // optimistic
    const { error } = await supabase.from('profiles').update({ lifeScoreMode: mode }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not change mode', description: error.message, variant: 'destructive' });
    }
    await mutate();
  }
```

Replace the `DayScoreRing` usage (line 115):

```tsx
            <StatCard>
              <DayScoreRing
                score={data.dayScore}
                mode={data.lifeScoreMode}
                onModeChange={handleModeChange}
              />
            </StatCard>
```

- [ ] **Step 2: Manual verification**

In the browser, visit `/logbook`, click each of the Today/Streak/Goal buttons, confirm the ring's value changes and the selection persists across a page refresh (i.e. `Profile.lifeScoreMode` was actually saved).

- [ ] **Step 3: Commit**

```bash
git add components/logbook/DayScoreRing.tsx "app/(logbook)/logbook/page.tsx"
git commit -m "feat(logbook): add life score mode toggle to the hub ring"
```

---

### Task 8: Trend chart component

**Files:**
- Create: `components/logbook/LifeScoreTrend.tsx`
- Modify: `app/(logbook)/logbook/page.tsx` (mount point, after the `DayScoreRing` `StatCard`)

**Interfaces:**
- Consumes: `LifeScoreMode` from `@/lib/logbook/lifeScore`; `apiFetch` from `@/lib/apiFetch` (already used in `app/(sociallog)/sociallog/page.tsx`); `useSWR`.
- Produces: `<LifeScoreTrend mode={LifeScoreMode} />` component, self-contained (fetches its own data).

- [ ] **Step 1: Write the component**

```tsx
// components/logbook/LifeScoreTrend.tsx
'use client';

import useSWR from 'swr';
import { format as formatDate } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/apiFetch';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';

interface TrendPoint {
  date: string;
  engagementScore: number | null;
  streakScore: number | null;
  goalScore: number | null;
}

const MODE_FIELD: Record<LifeScoreMode, keyof TrendPoint> = {
  engagement: 'engagementScore',
  streak: 'streakScore',
  goal: 'goalScore',
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trend');
  const json = await res.json();
  return json.trend as TrendPoint[];
}

export function LifeScoreTrend({ mode }: { mode: LifeScoreMode }) {
  const { data } = useSWR('/api/logbook/life-score-trend', fetcher);

  if (!data || data.length === 0) {
    return null;
  }

  const field = MODE_FIELD[mode];
  const series = data.map((p) => ({
    day: formatDate(new Date(p.date), 'MMM d'),
    value: p[field] ?? null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Life Score — last 30 days</CardTitle>
      </CardHeader>
      <CardContent className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it on the LogBook hub**

In `app/(logbook)/logbook/page.tsx`, import it:

```tsx
import { LifeScoreTrend } from '@/components/logbook/LifeScoreTrend';
```

Add directly after the `DayScoreRing` `StatCard` block (after the closing `</StatCard>` that follows Task 7's changes):

```tsx
            <LifeScoreTrend mode={data.lifeScoreMode} />
```

- [ ] **Step 3: Manual verification**

Visit `/logbook`. On a fresh account with no snapshots yet, confirm nothing renders (no error, no empty chart). After at least one day has passed and `getLogbookToday` has run once (creating yesterday's snapshot), confirm the chart appears with one data point, and switching the mode toggle (Task 7) changes which line values are plotted.

- [ ] **Step 4: Commit**

```bash
git add components/logbook/LifeScoreTrend.tsx "app/(logbook)/logbook/page.tsx"
git commit -m "feat(logbook): add life score trend chart"
```

---

### Task 9: SocialLog leaderboard API route

**Files:**
- Create: `app/api/sociallog/leaderboard/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `createServiceRoleClient` from `@/lib/supabase/serviceRole` (both already used in `app/api/sociallog/stats/route.ts`).
- Produces: `GET /api/sociallog/leaderboard` → `{ entries: Array<{ profileId: string; username: string; firstName: string; avatarUrl: string | null; score: number | null; isMe: boolean }> }`, sorted descending by `score` (nulls last).

"Friends" for this route = mutual `SocialFollow` (both directions exist) — the only symmetric relationship SocialLog currently has; the `Friendship` model in the schema is unused dead code and is not read here.

- [ ] **Step 1: Write the route**

```ts
// app/api/sociallog/leaderboard/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfile(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id, username, firstName, avatarUrl').eq('userId', userId).single();
  return data as { id: string; username: string; firstName: string; avatarUrl: string | null } | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const me = await getMyProfile(admin, user.id);
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [followingRes, followerRes] = await Promise.all([
      admin.from('social_follows').select('followingId').eq('followerId', me.id),
      admin.from('social_follows').select('followerId').eq('followingId', me.id),
    ]);

    const followingIds = new Set(((followingRes.data as { followingId: string }[]) || []).map((r) => r.followingId));
    const followerIds = new Set(((followerRes.data as { followerId: string }[]) || []).map((r) => r.followerId));
    const mutualIds = [...followingIds].filter((id) => followerIds.has(id));

    const profileIds = [me.id, ...mutualIds];

    const [profilesRes, snapshotsRes] = await Promise.all([
      admin.from('profiles').select('id, username, firstName, avatarUrl').in('id', profileIds),
      admin
        .from('life_score_snapshots')
        .select('profileId, date, engagementScore')
        .in('profileId', profileIds)
        .order('date', { ascending: false }),
    ]);

    const profiles = (profilesRes.data as { id: string; username: string; firstName: string; avatarUrl: string | null }[]) || [];
    const snapshots = (snapshotsRes.data as { profileId: string; date: string; engagementScore: number | null }[]) || [];

    const latestScoreByProfile = new Map<string, number | null>();
    for (const row of snapshots) {
      if (!latestScoreByProfile.has(row.profileId)) {
        latestScoreByProfile.set(row.profileId, row.engagementScore);
      }
    }

    const entries = profiles
      .map((p) => ({
        profileId: p.id,
        username: p.username,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        score: latestScoreByProfile.get(p.id) ?? null,
        isMe: p.id === me.id,
      }))
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('sociallog leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

With two test accounts that mutually follow each other and both have at least one `life_score_snapshots` row, `curl`/browser-visit `/api/sociallog/leaderboard` while logged in as one of them, confirm `entries` contains both profiles with `isMe` correctly flagged and sorted by `score` descending.

- [ ] **Step 3: Commit**

```bash
git add app/api/sociallog/leaderboard/route.ts
git commit -m "feat(sociallog): add life score leaderboard API route"
```

---

### Task 10: SocialLog leaderboard page

**Files:**
- Create: `app/(sociallog)/sociallog/leaderboard/page.tsx`
- Modify: `app/(sociallog)/sociallog/search/page.tsx` (add a link to the new page)

**Interfaces:**
- Consumes: `TopBar`, `SocialLogBottomNav`, `apiFetch`, `useSWR`, `Card`/`CardContent` (all existing, same imports as `app/(sociallog)/sociallog/page.tsx`).

- [ ] **Step 1: Write the leaderboard page**

```tsx
// app/(sociallog)/sociallog/leaderboard/page.tsx
'use client';

import useSWR from 'swr';
import { TrophyIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  profileId: string;
  username: string;
  firstName: string;
  avatarUrl: string | null;
  score: number | null;
  isMe: boolean;
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load leaderboard');
  const json = await res.json();
  return json.entries as LeaderboardEntry[];
}

export default function LeaderboardPage() {
  const { data, isLoading } = useSWR('/api/sociallog/leaderboard', fetcher);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Life Score Leaderboard" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-3 p-4 pb-24">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        )}

        {!isLoading && data && data.length <= 1 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <TrophyIcon className="h-8 w-8" />
              <p>Follow friends who follow you back to see them on the leaderboard.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && data && data.length > 1 && (
          <div className="space-y-2">
            {data.map((entry, i) => (
              <Card key={entry.profileId} className={cn(entry.isMe && 'border-primary')}>
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {entry.firstName} {entry.isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">@{entry.username}</p>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{entry.score ?? '—'}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Add a link from the Search page**

In `app/(sociallog)/sociallog/search/page.tsx`, add the `TopBar` `actions` prop and a `TrophyIcon` link:

```tsx
import Link from 'next/link';
import { TrophyIcon } from 'lucide-react';
```

Replace `<TopBar title="Search" />` with:

```tsx
      <TopBar
        title="Search"
        actions={
          <Link href="/sociallog/leaderboard" aria-label="Life Score leaderboard">
            <TrophyIcon className="h-5 w-5" />
          </Link>
        }
      />
```

- [ ] **Step 3: Manual verification**

Visit `/sociallog/search`, click the trophy icon, confirm it navigates to `/sociallog/leaderboard` and the page renders (empty state if you have no mutual follows yet, ranked list once you do).

- [ ] **Step 4: Commit**

```bash
git add "app/(sociallog)/sociallog/leaderboard/page.tsx" "app/(sociallog)/sociallog/search/page.tsx"
git commit -m "feat(sociallog): add life score leaderboard page"
```

---

## Post-implementation

- Run the full test suite once (`npx vitest run`) after Task 10 to confirm nothing else regressed.
- Update `README.md`'s LogBook and SocialLog feature bullets to mention the Life Score mode toggle, trend chart, and leaderboard tab.
- Update `[[project_feature_brainstorm_2026-09-02]]` memory: mark Unified Life Score as shipped once this plan's tasks are complete and pushed, then ask whether to move to the next idea from that list.
