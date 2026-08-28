# TaskLog — Idea Log — Design

**Date:** 2026-08-28
**Status:** Approved design, pending spec review

## Goal

Add an **Idea Log** to TaskLog's Plan page: a lightweight way to capture raw ideas (with a category like idea/startup/business/money) separately from actionable tasks, and an optional AI "Generate plan" action that turns an idea into a short written plan plus a reviewable list of concrete tasks.

## Non-Goals

- Free-form/user-defined categories — fixed starter list only for v1 (`idea`, `startup`, `business`, `money`, `other`).
- A dedicated Ideas route/page — lives as a tab on the existing `/tasklog/plan` page, not a new nav destination.
- Converting an idea itself into a task — an idea stays an idea; breakdown *spawns* separate `Task` rows linked back to it.
- Editing/regenerating the AI plan text after the fact beyond re-running "Generate plan" (which overwrites `plan` and lets the user review new tasks) — no manual plan-text editor.

## Decisions (locked during brainstorming)

1. **Placement:** Ideas is a tab on the existing Plan page (`app/(tasklog)/tasklog/plan/page.tsx`), not a new route.
2. **Data model:** new `Idea` entity, distinct from `Task`/`TaskGoal`. `Task` gains a nullable `ideaId` FK, mirroring the existing `goalId` pattern.
3. **Breakdown flow:** mirrors the existing Goal breakdown UX (review sheet, pre-checked/editable suggestions, confirm to insert), but the AI response includes a written `plan` summary in addition to the task list.
4. **Categories:** fixed enum — `idea` | `startup` | `business` | `money` | `other`.
5. **Task linkage:** tasks created from a breakdown get `ideaId` set and land in Plan (`lane = null`), same as goal-breakdown tasks do today.

## Architecture

### Data model (Prisma)

```prisma
model Idea {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile   @relation(fields: [profileId], references: [id])
  profileId   String    @db.Uuid
  title       String
  notes       String?
  category    String    // 'idea' | 'startup' | 'business' | 'money' | 'other'
  plan        String?   // AI-generated written summary, set after a breakdown is confirmed
  status      String    @default("open") // 'open' | 'planned' | 'archived'
  createdAt   DateTime  @default(now())
  tasks       Task[]

  @@map("tasklog_ideas")
}
```

`Task` gains:

```prisma
idea   Idea?  @relation(fields: [ideaId], references: [id])
ideaId String? @db.Uuid
```

Schema changes via `npx prisma db push` followed by `npx prisma generate`, consistent with how `TaskGoal`/`Task` were introduced (no migrations directory in this repo).

### RLS

Add `'tasklog_ideas'` to the existing generic owner-access loop in `supabase/rls.sql` (same block already covering `task_goals`, `tasklog_tasks`) — no bespoke policy needed. Run the updated block in the Supabase SQL editor after `prisma db push`.

### Plan page — Ideas tab

- `app/(tasklog)/tasklog/plan/page.tsx` gains a tab switcher (Tasks / Ideas), following whatever tab primitive already exists in `components/ui` (or a simple two-button toggle if none fits, matching existing styling).
- **Capture:** quick-add input + category dropdown → inserts an `Idea` row (`status: 'open'`). Fetched via the same SWR + `createClientComponentClient()` pattern the page already uses for tasks, under a second SWR key (`tasklog_ideas`).
- **List:** ideas rendered as cards, filterable by category, each showing title/notes/category badge and a "Generate plan" action. Ideas that already have a `plan` show a small indicator (e.g. a checkmark or "planned" badge) and the count of linked tasks.
- **Breakdown:** "Generate plan" opens `IdeaBreakdownReviewSheet.tsx` (new component, modeled directly on the existing `BreakdownReviewSheet.tsx`):
  1. Calls `app/api/ai/tasklog/idea-breakdown/route.ts` with the idea's title/notes/category.
  2. Response: `{ plan: string, tasks: [{ title, category, priority, suggestedDueDate? }] }`.
  3. Sheet shows the `plan` text at the top (read-only), then the suggested tasks pre-checked and inline-editable, same interaction as goal breakdown.
  4. "Add selected" writes the AI's `plan` onto the `Idea` row and inserts the chosen tasks with `ideaId` set, `lane = null` (Plan inbox) — consistent with goal-breakdown tasks landing in Plan.
  5. Re-running "Generate plan" on an idea that already has a plan overwrites `plan` with the new text; previously created tasks are untouched (no dedup/removal logic — out of scope for v1).

### AI route

`app/api/ai/tasklog/idea-breakdown/route.ts`, copied from `app/api/ai/tasklog/breakdown/route.ts`'s structure (same `getModel()`/OpenRouter JSON-mode setup from `lib/ai/modelConfig.ts` / `lib/ai/openrouter.ts`), with a prompt tailored to ideas and a response schema of `{ plan, tasks[] }` instead of just `tasks[]`.

## Components & files summary

**New:**
- `app/(tasklog)/tasklog/plan/_components/IdeaCard.tsx`
- `app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx`
- `app/(tasklog)/tasklog/plan/_components/IdeaBreakdownReviewSheet.tsx`
- `app/api/ai/tasklog/idea-breakdown/route.ts`
- Prisma model `Idea`; `Task.ideaId` field.

**Modified:**
- `app/(tasklog)/tasklog/plan/page.tsx` — add Tasks/Ideas tab switcher and Ideas SWR fetch.
- `lib/tasklog/types.ts` — add `IdeaRow`, `IdeaCategory`, `IDEA_CATEGORIES` constant.
- `supabase/rls.sql` — add `tasklog_ideas` to the owner-access loop.
- `prisma/schema.prisma` — new `Idea` model + `Task.ideaId`.

## Data flow

```
Idea captured (title + category) → stored in tasklog_ideas, status 'open'
"Generate plan" → AI idea-breakdown → review sheet (plan text + editable task list)
Confirm → Idea.plan set; selected tasks inserted with ideaId set, lane = null → land in Plan (Tasks tab)
From there, tasks flow through the existing Plan → triage → Board pipeline unchanged
```

## Error handling

- AI breakdown endpoint: on failure or malformed model output, review sheet shows an error toast with a retry — no partial writes (idea's `plan` and tasks are only written on explicit "Add selected" confirm).
- Idea capture: plain insert, no AI involved, so no fallback path needed beyond standard Supabase error toast.

## Testing

- **Manual/e2e:** create an idea with a category, confirm it lists under the Ideas tab; run "Generate plan", confirm the review sheet shows plan text + editable tasks; confirm selected tasks appear in the Tasks tab of Plan with the idea linked; verify RLS by confirming a second test account cannot see another profile's ideas.

## Rollout / ordering

1. Prisma `Idea` model + `Task.ideaId` + RLS.
2. Ideas tab on Plan page: capture form + list (no AI yet).
3. `idea-breakdown` AI route + `IdeaBreakdownReviewSheet`.
4. Manual verification pass per Testing section above.
