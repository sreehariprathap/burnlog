# AI Jobs Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every AI API call as a job record and surface it as a new "AI Jobs" tab in Quick Glance, alongside swapping the Quick Glance trigger icon to `Zap`.

**Architecture:** A new `AiJob` Prisma model stores one row per AI call (input/output/status/timing). A shared `runAiJob` wrapper in `lib/ai/jobs.ts` creates/updates that row around each route's existing AI-call logic. A new `GET /api/ai/jobs` endpoint lists the current user's jobs. `HeaderQuickInfo.tsx` gains a shadcn `Tabs` split between the existing "Overview" content and a new `AiJobsList` component.

**Tech Stack:** Next.js (App Router) API routes, Prisma/Postgres, SWR, shadcn/ui `Tabs`, lucide-react icons. No test framework exists in this repo (`npm run build` — type-check + Next build — is the verification gate used by other plans here).

**Spec:** `docs/superpowers/specs/2026-09-02-ai-jobs-log-design.md`

## Global Constraints

- Every AI job's `input`/`output` are stored as full JSON (per spec) — not just status/metadata.
- Job logging must never break the underlying AI route: `runAiJob` catches its own Prisma errors internally and only ever re-throws errors from `fn()` itself.
- `app/api/ai/models/route.ts` is excluded from wrapping (config endpoint, not a generation call).
- `npm run build` must pass after every task.

---

### Task 1: `AiJob` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add `AiJob` model near `AiModelSetting` at line 282; add inverse relation to `Profile` model at line 11)

**Interfaces:**
- Produces: Prisma model `AiJob` with fields `id, profileId, jobType, app, status, input, output, error, model, durationMs, createdAt, completedAt` — used by Task 2 (`lib/ai/jobs.ts`) and Task 3 (`GET /api/ai/jobs`).

- [ ] **Step 1: Add the `AiJob` model**

In `prisma/schema.prisma`, after the closing `}` of `model AiModelSetting` (currently ending at line 289), insert:

```prisma
/// log of every AI job (request) run across the app, for the AI Jobs panel
model AiJob {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String    @db.Uuid
  jobType     String
  app         String
  status      String    @default("running")
  input       Json?
  output      Json?
  error       String?
  model       String?
  durationMs  Int?
  createdAt   DateTime  @default(now())
  completedAt DateTime?

  @@index([profileId, createdAt])
  @@map("ai_jobs")
}
```

- [ ] **Step 2: Add the inverse relation on `Profile`**

Find the `Profile` model's existing relation fields (e.g. search for `notifications` or similar array relation already present in `model Profile`). Add a new line among them:

```prisma
  aiJobs                   AiJob[]
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_ai_job`
Expected: migration file created under `prisma/migrations/`, applied to the local dev database, `Prisma Client` regenerated with no errors.

- [ ] **Step 4: Verify the build picks up the new client**

Run: `npm run build`
Expected: build succeeds (this only type-checks the schema-derived client; no app code references `AiJob` yet).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(ai): add AiJob model for AI job logging"
```

---

### Task 2: `runAiJob` wrapper

**Files:**
- Create: `lib/ai/jobs.ts`

**Interfaces:**
- Consumes: `prisma` client from `@/lib/prisma` (check the exact import path used by other `lib/ai/*` or `app/api/*` files before writing — e.g. `grep -rn "from '@/lib/prisma'" app/api | head -3`).
- Produces: `runAiJob<T>(profileId: string, meta: { jobType: string; app: string; model?: string }, input: unknown, fn: () => Promise<T>): Promise<T>` — used by every route in Tasks 4–8.

- [ ] **Step 1: Confirm the Prisma client import path**

Run: `grep -rn "^import.*prisma" app/api/ai/models/route.ts lib/ai/*.ts 2>/dev/null`
If no hit, run: `grep -rln "PrismaClient\|from '@/lib/prisma'" --include=*.ts app lib | head -5` to find the shared client module. Use that exact import in Step 2.

- [ ] **Step 2: Write `lib/ai/jobs.ts`**

```ts
import { prisma } from '@/lib/prisma'; // adjust to the import path confirmed in Step 1
import type { Prisma } from '@prisma/client';

type AiJobMeta = {
  jobType: string;
  app: string;
  model?: string;
};

export async function runAiJob<T>(
  profileId: string,
  meta: AiJobMeta,
  input: unknown,
  fn: () => Promise<T>
): Promise<T> {
  let jobId: string | null = null;
  try {
    const job = await prisma.aiJob.create({
      data: {
        profileId,
        jobType: meta.jobType,
        app: meta.app,
        model: meta.model,
        input: input as Prisma.InputJsonValue,
        status: 'running',
      },
    });
    jobId = job.id;
  } catch (err) {
    console.error('runAiJob: failed to create job record', err);
  }

  const start = Date.now();
  try {
    const result = await fn();
    if (jobId) {
      prisma.aiJob
        .update({
          where: { id: jobId },
          data: {
            status: 'success',
            output: result as Prisma.InputJsonValue,
            durationMs: Date.now() - start,
            completedAt: new Date(),
          },
        })
        .catch((err) => console.error('runAiJob: failed to update success job record', err));
    }
    return result;
  } catch (err) {
    if (jobId) {
      prisma.aiJob
        .update({
          where: { id: jobId },
          data: {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - start,
            completedAt: new Date(),
          },
        })
        .catch((updateErr) => console.error('runAiJob: failed to update error job record', updateErr));
    }
    throw err;
  }
}
```

Note: the update calls are fire-and-forget (not `await`ed) so a slow/failing DB write never delays the route's response to the client; the `create` call is awaited since later tasks need `jobId` before `fn()` runs.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (file is unused so far, but must type-check cleanly).

- [ ] **Step 4: Commit**

```bash
git add lib/ai/jobs.ts
git commit -m "feat(ai): add runAiJob wrapper for AI job logging"
```

---

### Task 3: `GET /api/ai/jobs` endpoint

**Files:**
- Create: `app/api/ai/jobs/route.ts`

**Interfaces:**
- Consumes: `runAiJob`'s `AiJob` shape from Task 1 (fields: `id, jobType, app, status, error, model, durationMs, createdAt, completedAt, input, output`).
- Produces: `GET /api/ai/jobs` → `{ jobs: AiJobDTO[] }` — used by Task 9 (`AiJobsList` component).

- [ ] **Step 1: Write the route**

Base it on the auth pattern already used in `app/api/ai/estimate-food-calories/route.ts` (Supabase auth → look up the caller's `Profile` row by `userId`). Check how other routes resolve `profileId` from the authenticated user (e.g. `grep -n "profile.findUnique\|profile.findFirst" app/api -r | head -5`) and match that exactly.

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma'; // adjust to the import path confirmed in Task 2 Step 1

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const jobs = await prisma.aiJob.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ jobs });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manually verify against the dev server**

Run: `npm run dev` (in background), sign in via the browser, then `curl -s http://localhost:3000/api/ai/jobs -H "Cookie: <copy from browser devtools>"` — or simpler, visit `/api/ai/jobs` directly in a browser tab where you're already signed in.
Expected: `{"jobs":[]}` (empty, since no jobs have been logged yet).

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/jobs/route.ts
git commit -m "feat(ai): add GET /api/ai/jobs endpoint"
```

---

### Task 4: Wrap burnlog AI routes

**Files:**
- Modify: `app/api/ai/estimate-food-calories/route.ts`
- Modify: `app/api/ai/estimate-workout-calories/route.ts`
- Modify: `app/api/ai/scan-food/route.ts`
- Modify: `app/api/ai/scan-receipt/route.ts`
- Modify: `app/api/ai/meal-plan/route.ts`
- Modify: `app/api/ai/meal-plan/candidates/route.ts`
- Modify: `app/api/ai/meal-plan/finalize/route.ts`
- Modify: `app/api/ai/workout-plan/route.ts`
- Modify: `app/api/ai/program/route.ts`

**Interfaces:**
- Consumes: `runAiJob` from `lib/ai/jobs.ts` (Task 2).

- [ ] **Step 1: Wrap `estimate-food-calories/route.ts`**

Current logic (validated in the earlier exploration) builds `MODEL`, calls `client.chat.completions.create`, parses `result`, and returns `NextResponse.json({...})`. Each route needs the caller's `profile.id` — check how the route currently resolves the profile (it may only have `user.id`; if so, add a `prisma.profile.findUnique({ where: { userId: user.id } })` lookup right after the auth check, matching the pattern from Task 3).

Wrap everything from prompt construction through building the final response object:

```ts
const jobInput = { description, mealType };
const responsePayload = await runAiJob(
  profile.id,
  { jobType: 'estimate-food-calories', app: 'burnlog', model: MODEL },
  jobInput,
  async () => {
    // ...existing prompt + client.chat.completions.create + parsing logic...
    // ends with the same object literal currently passed to NextResponse.json(...)
    return {
      foodName: result.foodName ?? 'Unknown food',
      calories: Math.round(calories),
      protein: Number(result.protein ?? 0),
      carbs: Number(result.carbs ?? 0),
      fat: Number(result.fat ?? 0),
      fiber: Number(result.fiber ?? 0),
      items,
      confidence: result.confidence ?? 'medium',
      notes: result.notes ?? '',
      mealType,
    };
  }
);
return NextResponse.json(responsePayload);
```

Keep every existing early-return (400/401/422/502 validation and parse-failure branches) exactly where it is, outside the `runAiJob` closure — only the successful-generation path moves inside.

- [ ] **Step 2: Repeat the same wrap for the remaining 8 routes**

For each of `estimate-workout-calories`, `scan-food`, `scan-receipt`, `meal-plan`, `meal-plan/candidates`, `meal-plan/finalize`, `workout-plan`, `program`:
1. Read the file.
2. Resolve `profile.id` the same way as Step 1 if not already available.
3. Wrap the AI-call-to-result section in `runAiJob(profile.id, { jobType: '<route-slug-from-spec-table>', app: 'burnlog', model: MODEL }, <relevant request fields>, async () => { ... })`.
4. Leave pre-AI validation and post-AI error branches outside the wrapper.
5. Use the exact `jobType` values from the spec's route table (`meal-plan-candidates`, `meal-plan-finalize` for the two nested ones).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds, no type errors in any of the 9 modified files.

- [ ] **Step 4: Manually verify one route end-to-end**

With `npm run dev` running and signed in, trigger a food calorie estimate from the burnlog UI (or `curl -X POST http://localhost:3000/api/ai/estimate-food-calories` with a session cookie and `{"description":"banana"}`), then `curl http://localhost:3000/api/ai/jobs` (same session) and confirm a `jobType: "estimate-food-calories"` row appears with `status: "success"` and populated `input`/`output`.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai/estimate-food-calories/route.ts app/api/ai/estimate-workout-calories/route.ts app/api/ai/scan-food/route.ts app/api/ai/scan-receipt/route.ts app/api/ai/meal-plan/route.ts "app/api/ai/meal-plan/candidates/route.ts" "app/api/ai/meal-plan/finalize/route.ts" app/api/ai/workout-plan/route.ts app/api/ai/program/route.ts
git commit -m "feat(ai): log burnlog AI routes as AI jobs"
```

---

### Task 5: Wrap tasklog AI routes

**Files:**
- Modify: `app/api/ai/categorize-task/route.ts`
- Modify: `app/api/ai/tasklog/breakdown/route.ts`
- Modify: `app/api/ai/tasklog/idea-breakdown/route.ts`
- Modify: `app/api/ai/tasklog/parse-quick-add/route.ts`

**Interfaces:**
- Consumes: `runAiJob` from `lib/ai/jobs.ts` (Task 2).

- [ ] **Step 1: Wrap each route**

Same procedure as Task 4 Step 2, using `app: 'tasklog'` and `jobType` values `categorize-task`, `tasklog-breakdown`, `tasklog-idea-breakdown`, `tasklog-parse-quick-add` per the spec's route table.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manually verify one route**

Trigger `categorize-task` (or another) from the tasklog UI, then check `/api/ai/jobs` shows the new row with `app: "tasklog"`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/categorize-task/route.ts app/api/ai/tasklog
git commit -m "feat(ai): log tasklog AI routes as AI jobs"
```

---

### Task 6: Wrap homelog + learnlog AI routes

**Files:**
- Modify: `app/api/ai/homelog/suggest-chores/route.ts`
- Modify: `app/api/ai/learnlog/onboarding/route.ts`
- Modify: `app/api/ai/learnlog/suggestions/route.ts`

**Interfaces:**
- Consumes: `runAiJob` from `lib/ai/jobs.ts` (Task 2).

- [ ] **Step 1: Wrap each route**

Same procedure as Task 4 Step 2. `suggest-chores` → `app: 'homelog'`, `jobType: 'suggest-chores'`. The two learnlog routes → `app: 'learnlog'`, `jobType: 'learnlog-onboarding'` / `'learnlog-suggestions'`.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manually verify one route**

Trigger `suggest-chores` from the homelog UI, confirm it shows up in `/api/ai/jobs` with `app: "homelog"`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/homelog app/api/ai/learnlog
git commit -m "feat(ai): log homelog and learnlog AI routes as AI jobs"
```

---

### Task 7: Wrap travellog AI routes

**Files:**
- Modify: `app/api/ai/travellog/currency/route.ts`
- Modify: `app/api/ai/travellog/itinerary/route.ts`
- Modify: `app/api/ai/travellog/suggestions/route.ts`

**Interfaces:**
- Consumes: `runAiJob` from `lib/ai/jobs.ts` (Task 2).

- [ ] **Step 1: Wrap each route**

Same procedure as Task 4 Step 2, using `app: 'travellog'` and `jobType` values `travellog-currency`, `travellog-itinerary`, `travellog-suggestions`.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manually verify one route**

Trigger `travellog/currency` (or another) from the travellog UI, confirm the job appears with `app: "travellog"`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/travellog
git commit -m "feat(ai): log travellog AI routes as AI jobs"
```

---

### Task 8: `AiJobsList` component

**Files:**
- Create: `components/logbook/AiJobsList.tsx`

**Interfaces:**
- Consumes: `GET /api/ai/jobs` response shape `{ jobs: AiJobDTO[] }` from Task 3, where `AiJobDTO = { id: string; jobType: string; app: string; status: 'running'|'success'|'error'; error: string | null; model: string | null; durationMs: number | null; createdAt: string; completedAt: string | null; input: unknown; output: unknown }`.
- Produces: `AiJobsList()` component (no props — self-fetches) — used by Task 9 (`HeaderQuickInfo.tsx`).

- [ ] **Step 1: Check the date formatting utility already in use**

Run: `grep -rn "formatDistanceToNow\|date-fns" components/logbook | head -5`
Use whatever pattern `ActivityTimeline.tsx` already uses for relative timestamps — match it exactly rather than introducing a new dependency.

- [ ] **Step 2: Write the component**

```tsx
// components/logbook/AiJobsList.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Skeleton } from '@/components/ui/skeleton';

type AiJobDTO = {
  id: string;
  jobType: string;
  app: string;
  status: 'running' | 'success' | 'error';
  error: string | null;
  model: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
  input: unknown;
  output: unknown;
};

async function fetchAiJobs(): Promise<{ jobs: AiJobDTO[] }> {
  const res = await fetch('/api/ai/jobs');
  if (!res.ok) throw new Error('Failed to load AI jobs');
  return res.json();
}

const STATUS_STYLES: Record<AiJobDTO['status'], string> = {
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function humanizeJobType(jobType: string): string {
  return jobType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function JobRow({ job }: { job: AiJobDTO }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{humanizeJobType(job.jobType)}</span>
          <span className="text-xs text-muted-foreground">
            {job.app} &middot; {new Date(job.createdAt).toLocaleString()}
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
          {job.status}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {job.status === 'error' && job.error && (
            <p className="text-xs text-red-600 dark:text-red-400">{job.error}</p>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Input</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </div>
          {job.output != null && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Output</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-xs">
                {JSON.stringify(job.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AiJobsList() {
  const { data, isLoading } = useSWR('ai-jobs', fetchAiJobs);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.jobs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No AI activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  );
}
```

If Step 1 found a different relative-time pattern already in use elsewhere in `components/logbook`, swap the `new Date(job.createdAt).toLocaleString()` calls for that pattern instead, for consistency.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/logbook/AiJobsList.tsx
git commit -m "feat(ai): add AiJobsList component"
```

---

### Task 9: Wire tabs + icon into `HeaderQuickInfo.tsx`

**Files:**
- Modify: `components/HeaderQuickInfo.tsx`

**Interfaces:**
- Consumes: `AiJobsList` from `components/logbook/AiJobsList.tsx` (Task 8); `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs` (existing primitive, see `app/(burnlog)/burnlog/dashboard/_components/quick-log/LogCaloriesModal.tsx` for usage pattern).

- [ ] **Step 1: Swap the trigger icon**

In `components/HeaderQuickInfo.tsx`:
- Line 6: change `import { Sparkles } from 'lucide-react';` to `import { Zap } from 'lucide-react';`
- Line 43: change `<Sparkles size={20} />` to `<Zap size={20} />`

- [ ] **Step 2: Add the `Tabs` import**

Add alongside the other UI imports:

```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiJobsList } from '@/components/logbook/AiJobsList';
```

- [ ] **Step 3: Wrap the drawer body in `Tabs`**

Replace the `<div className="flex flex-col gap-5 overflow-y-auto p-4 pb-8">...</div>` block (current lines 50-71) with:

```tsx
<Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
  <TabsList className="mx-4 grid grid-cols-2">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="ai-jobs">AI Jobs</TabsTrigger>
  </TabsList>
  <TabsContent value="overview" className="flex flex-col gap-5 overflow-y-auto p-4 pb-8">
    <GlobalSearch onNavigate={() => setOpen(false)} />
    {isLoading || !data ? (
      <>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </>
    ) : (
      <>
        <StreakBadge streak={data.streak} streakApps={data.streakApps} />
        <LogCardsGrid cards={data.cards} />
        <div>
          <h2 className="mb-2 text-sm font-semibold">Today&apos;s activity</h2>
          <ActivityTimeline events={data.activity.slice(-RECENT_ACTIVITY_COUNT)} />
        </div>
      </>
    )}
  </TabsContent>
  <TabsContent value="ai-jobs" className="overflow-y-auto p-4 pb-8">
    <AiJobsList />
  </TabsContent>
</Tabs>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, open the app, click the Quick Glance trigger (now a lightning-bolt icon), confirm both tabs render, "Overview" shows the same content as before, and "AI Jobs" shows the jobs logged during Tasks 4–7's manual verification steps (or "No AI activity yet." if none were run in this environment).

- [ ] **Step 6: Commit**

```bash
git add components/HeaderQuickInfo.tsx
git commit -m "feat(ai): add AI Jobs tab and Zap icon to Quick Glance"
```

---

### Task 10: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds cleanly, no warnings about unused imports (e.g. leftover `Sparkles` import) or type errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new lint errors introduced by this feature's files.

- [ ] **Step 3: End-to-end smoke test**

With `npm run dev` running: trigger at least one AI route from each app touched in Tasks 4–7 (burnlog, tasklog, homelog, learnlog, travellog), then open Quick Glance → AI Jobs and confirm all of them appear with correct `app` badges, `success` status, and expandable input/output.
