# TaskLog

Task and goal management sub-app. One of seven sub-apps under LogBook — see
the [root README](../../README.md) for how it fits into the wider app.

## What it does

- **Home** (`/tasklog`) — task overview.
- **Board** (`/tasklog/board`) — kanban-style board for tracking tasks
  through stages.
- **Plan** (`/tasklog/plan`) — planning view.
- **Goals** (`/tasklog/goals`) — goal tracking, separate from task items.
- **Config** (`/tasklog/config`) — TaskLog-specific settings plus "Export
  config as JSON". No dedicated onboarding flow yet ("Reonboard" is hidden
  until one exists — see `docs/superpowers/specs/2026-08-31-onboarding-foundation-design.md`).

Also home to the idea log (`Idea` model, shared with LogBook's quick-add)
and My Day time-blocking, which surfaces in LogBook's own hub as well as
here.

## Routes

```
/tasklog          Home
/tasklog/board      Kanban board
/tasklog/plan         Planning view
/tasklog/goals          Goals
/tasklog/config            Settings
```

## Data model

Prisma models: `TaskGoal`, `Task`, `Idea`, `MydayBlock`. Shares the
top-level `Profile` model with every other app.

## Key files

```
app/(tasklog)/
  layout.tsx           Route-group layout/theming
  tasklog/page.tsx        Home
  tasklog/board/            Kanban board
  tasklog/plan/               Planning view
  tasklog/goals/                 Goals
  tasklog/config/                   Settings
components/TaskLogBottomNav.tsx     TaskLog's bottom nav
lib/tasklog/                          TaskLog-specific helpers
```
