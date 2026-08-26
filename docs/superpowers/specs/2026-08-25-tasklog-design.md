# TaskLog — Design

**Date:** 2026-08-25
**Status:** Approved design, pending spec review

## Goal

Add **TaskLog** as a third app in the existing BurnLog/LifeLog shell: an advanced personal task manager with a kanban-style board, a quick-capture inbox ("Plan"), a daily dashboard, and AI-powered Goals that break an idea into concrete tasks. Blue theme, same shared component system as BurnLog/LifeLog.

## Non-Goals

- Custom/user-defined lanes (fixed To Do / In Progress / Done for v1).
- Cross-app data pull (e.g. BurnLog/LifeLog data feeding TaskLog) — out of scope.
- Push-notification reminders for due tasks — the existing `ScheduledReminder`/cron system is not extended in this pass; can follow later.
- Team/sharing features — single-user, same as the rest of the app.

## Decisions (locked during brainstorming)

1. **Scope:** one spec, phased implementation plan (shell → board → plan → dashboard → goals/AI).
2. **Board lanes:** fixed 3 — To Do, In Progress, Done. No lane CRUD.
3. **Task fields:** title, notes, category (life/work), priority (low/med/high), due date, `plannedForToday` flag.
4. **Dashboard scope:** due-today + overdue + manually "planned for today" tasks.
5. **Plan vs Board:** Plan is an unsorted inbox (quick capture, `lane = null`); Board is triaged work (`lane` set). Moving a task from Plan to a lane is the only way it "enters" the board.
6. **AI goals flow:** AI proposes a task breakdown from a goal description; user reviews/edits/deselects before anything is created. Regenerable on demand, not just at goal creation.
7. **Goal progress:** tracked via linked tasks; goal auto-completes at 100%.
8. **Delight features (v1):** daily streak/completion stats, natural-language quick-add parsing, drag-and-drop kanban board.
9. **Home/nav:** Dashboard is home (`/tasklog`). Bottom nav order: Dashboard → Board → Plan → Goals.
10. **Theme:** blue palette, distinct from BurnLog (warm orange) and LifeLog (teal/emerald).

## Architecture

### Shell extension

Follows the exact pattern used to add LifeLog (see `2026-08-22-lifelog-app-shell-design.md`):

- `lib/appMode.ts`:
  - `AppId` becomes `'burnlog' | 'lifelog' | 'tasklog'`.
  - `APPS.tasklog = { id: 'tasklog', name: 'TaskLog', tagline: 'Plan, track, and crush your goals', home: '/tasklog', themeClass: 'app-tasklog' }`.
  - `isAppId` updated to accept `'tasklog'`.
- `app/(tasklog)/layout.tsx`: mirrors `(lifelog)/layout.tsx` — adds `.app-tasklog` class to `<html>` on mount, calls `setActiveApp('tasklog')`.
- `app/(burnlog)/layout.tsx` and `app/(lifelog)/layout.tsx`: no change needed (they already only add/ensure their own class; the new class is orthogonal).
- `components/AppSwitcher.tsx`: extend the icon ternary to render a TaskLog mark for `app.id === 'tasklog'` (Lucide `ListChecks`, no image asset required — LifeLog already showed a Lucide-style mark component `LifeLogMark` is an option to imitate, but a plain `<ListChecks />` icon is sufficient for v1).
- `app/globals.css`: new `.app-tasklog` and `.app-tasklog.dark` blocks, same property set as `.app-lifelog` blocks, blue hues (indigo-blue primary, cool neutral background/foreground). Exact values chosen at implementation time by sampling the same OKLCH structure LifeLog uses.
- New route group `app/(tasklog)/` with `tasklog/page.tsx` (dashboard/home), `tasklog/board/page.tsx`, `tasklog/plan/page.tsx`, `tasklog/goals/page.tsx`.
- Bottom nav: TaskLog gets its own nav config (Dashboard/Board/Plan/Goals icons), following whatever pattern `BottomNav.tsx` currently uses to vary tabs per app (already parameterized for LifeLog).
- Middleware: `/tasklog*` falls under the same authenticated/profile-checked catch-all as `/lifelog*` — no change required, verify during implementation.

### Data model (Prisma)

```prisma
model TaskGoal {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile     Profile  @relation(fields: [profileId], references: [id])
  profileId   String   @db.Uuid
  title       String
  description String?
  category    String   // 'life' | 'work'
  status      String   @default("active") // 'active' | 'completed' | 'archived'
  createdAt   DateTime @default(now())
  tasks       Task[]

  @@map("task_goals")
}

model Task {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile         Profile   @relation(fields: [profileId], references: [id])
  profileId       String    @db.Uuid
  goal            TaskGoal? @relation(fields: [goalId], references: [id])
  goalId          String?   @db.Uuid
  title           String
  notes           String?
  category        String    // 'life' | 'work'
  priority        String    @default("medium") // 'low' | 'medium' | 'high'
  lane            String?   // null = Plan inbox; else 'todo' | 'in_progress' | 'done'
  dueDate         DateTime? @db.Date
  plannedForToday Boolean   @default(false)
  position        Int       @default(0)
  completedAt     DateTime?
  createdAt       DateTime  @default(now())

  @@map("tasklog_tasks")
}
```

`Profile` gains two columns for the TaskLog streak (kept separate from BurnLog's `currentStreak`/`longestStreak`, which are fitness-specific):

```prisma
taskLogCurrentStreak Int @default(0)
taskLogLongestStreak Int @default(0)
```

Schema changes via `npx prisma db push` (no migrations directory in this repo), followed by `npx prisma generate`.

### RLS

Add `'task_goals'` and `'tasklog_tasks'` to the `array[...]` loop in `supabase/rls.sql` (the existing generic "owned via `profileId`" policy block already used for `financial_goals`, `meal_plan_entries`, etc.) — no bespoke policy needed. Run the updated block in the Supabase SQL editor after `prisma db push`.

### Board (`/tasklog/board`)

- Three fixed columns: To Do / In Progress / Done, horizontally scrollable on mobile.
- New dependency: `@dnd-kit/core` + `@dnd-kit/sortable` (touch-friendly drag-and-drop; nothing equivalent exists in the repo). Dragging a card between/within columns writes `lane` and recomputes `position` for affected rows.
- Card: title, priority dot (color-coded), category badge (life/work), due-date chip if set. Tap opens a detail sheet to edit notes/priority/category/due date, mark complete, or delete.
- Completing a task (drag to Done or explicit action) sets `completedAt`. If `goalId` is set, the goal's progress is recomputed (see Goals section).
- "+ New task" on the board adds directly into To Do (bypasses Plan) for quick capture while actively working the board.

### Plan (`/tasklog/plan`)

- List of tasks where `lane IS NULL`, newest first (or manual `position` ordering).
- Quick-add bar at the top. Plain text creates a task with default category/priority.
- **Natural-language quick-add:** input like "call mom tomorrow high priority" is sent to a small parsing endpoint (`app/api/ai/tasklog/parse-quick-add/route.ts`) built on the existing OpenRouter/model-config layer (`lib/ai/openrouter.ts`, `lib/ai/modelConfig.ts`), returning `{ title, dueDate?, priority? }`. Low-confidence or malformed responses fall back to a plain-title task — never blocks capture.
- Triaging: selecting a lane on an inbox item moves it to the Board (sets `lane`); this is the only path off Plan besides deleting.

### Dashboard (`/tasklog`, home)

- **Today's list:** tasks where `dueDate = today OR plannedForToday = true`, split into "Overdue" (dueDate < today, not completed) and "Today" sections. Simple checklist cards; tap-to-complete, tap for detail sheet.
- **"Plan my day" picker:** button opens a sheet listing undated Plan/Board tasks (not already planned/due today) with toggles to flip `plannedForToday` on selected ones.
- **Streak widget:** reuses the visual language of `AnimatedCircularProgressBar` (as used in `DailyRingsWidget`). A day "counts" toward the streak once every task with `dueDate = today` or `plannedForToday = true` is completed. Backed by `taskLogCurrentStreak`/`taskLogLongestStreak` on `Profile`, updated by the same kind of day-rollover check pattern BurnLog uses for its streak.
- Quick stat row: counts of To Do / In Progress / Done for today's set.

### Goals + AI (`/tasklog/goals`)

- Goal card: title, description, category (life/work), progress bar (`completed linked tasks / total linked tasks`). Auto-flips `status` to `'completed'` at 100% (with tasks > 0).
- **Generate tasks flow:**
  1. User creates a goal (title + optional free-text description, category).
  2. "Generate tasks" calls `app/api/ai/tasklog/breakdown/route.ts` (same OpenRouter/model-config pattern as `app/api/ai/meal-plan/candidates/route.ts`), passing the goal's title/description/category.
  3. Response: a structured list of suggested tasks (`title`, `category`, `priority`, optional `suggestedDueDate`).
  4. Review sheet shows all suggestions pre-checked and inline-editable; user can deselect/edit any before confirming.
  5. "Add selected" creates the chosen tasks in **Plan** (`lane = null`, `goalId` set to the goal) — consistent with Plan being the inbox for anything not yet triaged.
  6. "Regenerate" is available anytime on an existing goal for a fresh batch, not just at creation.

## Components & files summary

**New:**
- `app/(tasklog)/layout.tsx`
- `app/(tasklog)/tasklog/page.tsx` — Dashboard
- `app/(tasklog)/tasklog/board/page.tsx` + `_components/` (columns, card, detail sheet, DnD wiring)
- `app/(tasklog)/tasklog/plan/page.tsx` + `_components/` (inbox list, quick-add bar)
- `app/(tasklog)/tasklog/goals/page.tsx` + `_components/` (goal list/card, create form, breakdown review sheet)
- `app/api/ai/tasklog/breakdown/route.ts`
- `app/api/ai/tasklog/parse-quick-add/route.ts`
- Prisma models `TaskGoal`, `Task`; `Profile` streak columns.

**Modified:**
- `lib/appMode.ts` — add `'tasklog'` app id + registry entry.
- `components/AppSwitcher.tsx` — TaskLog icon case.
- `components/BottomNav.tsx` (or per-app nav config) — TaskLog tab set.
- `app/globals.css` — `.app-tasklog` + `.app-tasklog.dark` blue palette blocks.
- `supabase/rls.sql` — add `task_goals`, `tasklog_tasks` to the owner-access loop.
- `prisma/schema.prisma` — new models + `Profile` streak fields.
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`.

## Data flow

```
Goal created → "Generate tasks" → AI breakdown → review sheet → confirmed tasks land in Plan (goalId set)
Plan item → triage (pick lane) → Board
Board drag → lane/position update → completedAt set on Done → goal progress recomputed if goalId set
Dashboard reads: (dueDate = today OR plannedForToday) tasks across Plan+Board → today list
Task completed from Dashboard/Board → streak check (all of today's set done?) → Profile.taskLogCurrentStreak updated
```

## Error handling

- AI breakdown/parse endpoints: on failure or malformed model output, fail soft — breakdown shows an error toast with a retry, quick-add falls back to a plain-title task. Never lose user input.
- Drag-and-drop: optimistic UI update, revert on write failure with a toast.
- `localStorage`/app-mode helpers: unaffected, already handle unavailability (see `lib/appMode.ts`).

## Testing

- **Manual/e2e:** switch into TaskLog from the AppSwitcher, confirm blue theme applies and reverts on switch-out; create a goal → generate → review → confirm tasks appear in Plan; triage a Plan item onto the Board; drag between lanes; complete all of today's tasks and confirm streak increments; verify RLS by confirming a second test account cannot see another profile's tasks/goals.
- **Perf sanity:** TaskLog route-group chunk not present in BurnLog/LifeLog initial bundles (same code-splitting check as the LifeLog shell).

## Rollout / ordering

1. Prisma models + RLS + shell extension (`appMode`, layout, globals.css, AppSwitcher, nav) — get the empty shell switchable and themed first.
2. Board (with DnD) — the core "committed work" surface.
3. Plan (inbox + quick-add, including NL parsing).
4. Dashboard (today list, plan-my-day, streak).
5. Goals + AI breakdown flow.
6. Manual verification pass per Testing section above.
