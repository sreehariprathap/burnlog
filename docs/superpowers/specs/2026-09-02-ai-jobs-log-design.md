# AI Jobs Log + Quick Glance Tab

## Problem

Quick Glance (the header drawer, `components/HeaderQuickInfo.tsx`) has no
visibility into AI activity. Every AI-backed feature across the app (receipt
scanning, meal/workout plan generation, chore suggestions, task breakdown,
etc.) runs as a one-shot API call with no durable record of what was asked or
what came back. Users can't review past AI output, and there's no shared
place to see "what has AI done for me."

## Goals

- Persist every AI invocation as a job: what ran, for which app, its status,
  and its full input/output.
- Surface that history in Quick Glance as a second tab, "AI Jobs."
- Swap the Quick Glance trigger icon from `Sparkles` to `Zap`.

## Non-goals

- No interactive AI chat/assistant UI — this is a passive log/history view
  only (confirmed with user).
- No retry/re-run action from the log in this pass.
- No cross-user visibility — each user sees only their own jobs.

## Data model

New Prisma model, `prisma/schema.prisma`:

```prisma
/// log of every AI job (request) run across the app, for the AI Jobs panel
model AiJob {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId   String    @db.Uuid
  jobType     String    // route slug, e.g. "estimate-food-calories"
  app         String    // e.g. "burnlog", "homelog", "tasklog", "travellog", "learnlog"
  status      String    @default("running") // "running" | "success" | "error"
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

`Profile` gains the inverse relation field (`aiJobs AiJob[]`), matching the
pattern used by `Notification`/`StaminaSession`.

Requires a `prisma migrate dev` migration.

## Wrapper: `lib/ai/jobs.ts`

```ts
export async function runAiJob<T>(
  profileId: string,
  meta: { jobType: string; app: string; model?: string },
  input: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const job = await prisma.aiJob.create({
    data: { profileId, jobType: meta.jobType, app: meta.app, model: meta.model, input: input as Prisma.InputJsonValue, status: 'running' },
  });
  const start = Date.now();
  try {
    const result = await fn();
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'success', output: result as Prisma.InputJsonValue, durationMs: Date.now() - start, completedAt: new Date() },
    });
    return result;
  } catch (err) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'error', error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start, completedAt: new Date() },
    });
    throw err;
  }
}
```

Job logging failures (e.g. a DB hiccup) must not break the underlying AI
route — `runAiJob` wraps its own create/update calls in try/catch internally
so a logging failure only logs to console, never throws past `fn()`'s own
result/error.

## Routes wrapped (18 of 19 under `app/api/ai/*`)

Every route below gets one `runAiJob(profile.id, { jobType, app }, input, async () => { ...existing logic...; return result; })` wrap around its existing AI-call-to-result logic. Validation that happens before the AI call (missing fields, auth checks) stays outside the wrapper — only actual AI invocations are logged. `app` is inferred from the route's own domain, not literally parsed from the URL.

| Route | jobType | app |
|---|---|---|
| `estimate-food-calories` | `estimate-food-calories` | `burnlog` |
| `estimate-workout-calories` | `estimate-workout-calories` | `burnlog` |
| `scan-food` | `scan-food` | `burnlog` |
| `scan-receipt` | `scan-receipt` | `burnlog` |
| `meal-plan` | `meal-plan` | `burnlog` |
| `meal-plan/candidates` | `meal-plan-candidates` | `burnlog` |
| `meal-plan/finalize` | `meal-plan-finalize` | `burnlog` |
| `workout-plan` | `workout-plan` | `burnlog` |
| `program` | `program` | `burnlog` |
| `categorize-task` | `categorize-task` | `tasklog` |
| `tasklog/breakdown` | `tasklog-breakdown` | `tasklog` |
| `tasklog/idea-breakdown` | `tasklog-idea-breakdown` | `tasklog` |
| `tasklog/parse-quick-add` | `tasklog-parse-quick-add` | `tasklog` |
| `homelog/suggest-chores` | `suggest-chores` | `homelog` |
| `learnlog/onboarding` | `learnlog-onboarding` | `learnlog` |
| `learnlog/suggestions` | `learnlog-suggestions` | `learnlog` |
| `travellog/currency` | `travellog-currency` | `travellog` |
| `travellog/itinerary` | `travellog-itinerary` | `travellog` |
| `travellog/suggestions` | `travellog-suggestions` | `travellog` |

`app/api/ai/models/route.ts` is excluded — it's a config/list endpoint, not
an AI generation call.

## New endpoint: `GET /api/ai/jobs`

Auth-gated (same `supabase.auth.getUser()` pattern as other routes). Returns
the current user's `AiJob` rows, newest first, `take: 50`:

```ts
{ jobs: Array<{ id, jobType, app, status, error, model, durationMs, createdAt, completedAt, input, output }> }
```

## UI: Quick Glance tabs

`components/HeaderQuickInfo.tsx`:
- Trigger icon: `Sparkles` → `Zap` (import + usage, line 6 and 43).
- Wrap the `DrawerContent` body in shadcn `Tabs` (`@/components/ui/tabs`,
  same primitive already used elsewhere, e.g.
  `app/(burnlog)/burnlog/dashboard/_components/quick-log/LogCaloriesModal.tsx`).
  - `TabsList` with two `TabsTrigger`s: "Overview" and "AI Jobs".
  - `TabsContent value="overview"`: today's existing content, unchanged
    (GlobalSearch, StreakBadge, LogCardsGrid, ActivityTimeline).
  - `TabsContent value="ai-jobs"`: new `AiJobsList` component.

New `components/logbook/AiJobsList.tsx`:
- SWR-fetches `/api/ai/jobs` only when the AI Jobs tab is active (lazy, same
  pattern as the drawer's own `open ?` gating).
- Renders each job as a row: app badge, `jobType` (humanized), status badge
  (running/success/error, color-coded), relative timestamp
  (`formatDistanceToNow` or existing date-fns usage in repo).
- Row is expandable (click to toggle) to show `input`/`output` as formatted
  JSON in a `<pre>` block.
- Empty state: "No AI activity yet."
- This list *is* the history — no separate history view.

## Testing

- `npm run build` must pass (type-check + Next build) after schema/route
  changes.
- Manually exercise one wrapped route (e.g. `estimate-food-calories`) via the
  UI, then open Quick Glance → AI Jobs tab and confirm the job appears with
  correct status/input/output.
- Confirm a deliberately-failing AI call (e.g. malformed AI response) still
  logs as `status: "error"` with the error message, and that the route's own
  error response to the client is unaffected.
