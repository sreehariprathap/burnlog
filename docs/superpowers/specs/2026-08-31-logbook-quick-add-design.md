# Logbook quick-add: reuse real modals — design

## Problem

`components/logbook/../QuickAddFab.tsx` (in `app/(logbook)/logbook/_components/`)
already offers Meal/Task/Expense/Sleep, but Meal and Expense are hand-rolled
mini-forms that duplicate (and strip down) `LogCaloriesModal` and
`LogTransactionModal` from BurnLog/MoneyLog — losing their AI features (AI
calorie estimate, AI receipt scan). Workout and Steps aren't offered at all,
even though `LogWorkoutModal`, `LogStepsModal`, and `WalkTrackerModal` already
exist in `app/(burnlog)/dashboard/_components/quick-log/`.

## Goal

Log workouts, steps, and walks from Logbook home, and make Meal/Expense use
the same full-featured, AI-assisted modals the source apps use — no
duplicated logic.

## Approach

All the BurnLog/MoneyLog quick-log modals share one interface:
`{ profileId, onClose, onSaved }`, and each renders its own `<Drawer open>` —
confirmed in `QuickLogFab.tsx`'s mount-when-selected pattern. This makes them
drop-in replacements inside `QuickAddFab`'s own drawer-based picker.

Changes to `QuickAddFab.tsx`:

- Remove `MealForm` and `ExpenseForm` (the inline mini-forms).
- `OPTIONS` grows to: Meal (`LogCaloriesModal`), Workout (`LogWorkoutModal`,
  new), Steps (`LogStepsModal`, new), Walk (`WalkTrackerModal`, new), Task
  (unchanged `TaskForm`), Expense (`LogTransactionModal`), Sleep (unchanged
  `SleepComingSoon`).
- When an option is selected, render the imported modal directly instead of
  an inline form branch — each manages its own `<Drawer>`, so the picker
  drawer's content area simply swaps to the modal component.
- `onSaved` continues to trigger the existing toast + `mutate()` refresh of
  Logbook's today data.

## Out of scope

- Water intake and Weight quick-add (kept BurnLog-only per this pass).
- Any change to the underlying modals themselves.
