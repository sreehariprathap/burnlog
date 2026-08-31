# Dashboard Today's Activity — unified rings — design

## Problem

BurnLog dashboard's "Today's Activity" card (`DailyRingsWidget.tsx`) shows Burn,
Eat, Move, and Steps as four separate tab/carousel slides — only one ring
visible at a time, requiring swiping or tapping icon tabs to see the others.

## Goal

Show all four metrics at once, as concentric rings in a single card (Apple
Watch Activity style), with a legend below listing each metric's current/target.

## Approach

`DailyRingsWidget.tsx` keeps its existing data layer entirely as-is (`RINGS`
config, `fetchData`, `goals`/`metrics` state) and only changes the render:

- Drop `SmoothTabs` + `MotionCarousel` + `selectedIndex`.
- Stack four `AnimatedCircularProgressBar` instances, absolutely centered at
  decreasing sizes, ordered outside-in as Burn → Eat → Move → Steps (matches
  existing `RINGS` order and colors — no new color decisions needed).
- Below the rings, a legend: one row per metric with its icon (from `RINGS`),
  label, and `current / target` text, color-matched to its ring.

`AnimatedCircularProgressBar` (`components/ui/animated-circular-progress-bar.tsx`)
gets one new optional prop, `showValue?: boolean` (default `true`), to hide
the center percentage number when stacked — every existing caller
(`GoalProgressWidget`, `FinancialGoalsList`, `DayScoreRing`) keeps its default
`true` behavior unchanged.

## Out of scope

- Changing ring colors, targets, or data sources.
- Making rings/legend rows tappable (view-only, same as today).
