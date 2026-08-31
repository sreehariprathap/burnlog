# Logbook AI-feature icons — design

## Problem

Logbook already has several AI-assisted actions (meal calorie estimate,
workout calorie estimate, receipt scanning) via `lib/ai/modelConfig.ts` and
the `app/api/ai/*` routes, but nothing in the UI signals that these actions
are AI-powered. Task quick-complete has no AI assistance at all.

## Goal

Make Logbook read as "AI integrated": a visible badge on quick-add options
that use AI, and extend AI assistance to task quick-complete.

## Visual badge

A small sparkle badge (lucide `Sparkles`, same visual language as the
`Star` badge already added to `AppSwitcher`'s default-app indicator) on the
Quick Add sheet's option tiles (`components/logbook/../QuickAddFab.tsx`
`OPTIONS` grid) for Meal, Workout, and Expense — the three actions already
backed by an `app/api/ai/*` call. Steps, Task (before this change), and
Walk get no badge since they carry no AI assistance.

## New AI action: task auto-categorize + priority

- New route `app/api/ai/categorize-task/route.ts`, following the same shape
  as the existing `app/api/ai/*` routes: auth via `createRouteHandlerClient`,
  `getModel(supabase, 'text')` from `lib/ai/modelConfig.ts`, single-purpose
  prompt taking a task title and returning `{ category, priority }` matching
  the `TaskCategory`/priority enums already used in
  `app/(tasklog)/tasklog/goals/_components/AddGoalForm.tsx`.
- `QuickAddFab`'s `TaskForm`: after the user types a title (on blur, or a
  small "Suggest" button next to the field — implementation detail for the
  plan), call the route and pre-fill category/priority fields the form
  currently doesn't have. `TaskForm` gains `category`/`priority` state,
  defaulting to the AI suggestion but user-editable, and includes them in the
  `tasklog_tasks` insert.
- `TaskForm`'s tile in the `OPTIONS` grid gets the sparkle badge once this
  ships.

## Out of scope

- AI assistance for Steps (no reasonable AI estimate applies — it's a
  device-reported count).
- Changing the AI badge's meaning/behavior outside the Quick Add sheet (e.g.
  `LogCardsGrid` on Logbook home) — confirmed out of scope for this pass.
