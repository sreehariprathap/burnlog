# BurnLog

Fitness tracking sub-app. BurnLog was the original app this repo was built
around — it's now one of seven sub-apps living under LogBook (see the
[root README](../../README.md)), but it kept its original routes
(`/dashboard` rather than `/burnlog`) for backward compatibility.

## What it does

- **Dashboard** (`/dashboard`) — daily overview: today's activity ring,
  stats, quick links.
- **Sessions** (`/session`) — log workouts (Push/Pull/Legs, cardio,
  full-body, rest days), track sets/reps/weight.
- **Goals** (`/goals`) — create and monitor fitness goals.
- **Insights** (`/insights`) — charts and trends over weight, workouts,
  calories.
- **Meal Planner** (`/meal-planner`) — AI-assisted meal planning, with a
  grocery-list generator (`/meal-planner/grocery-list`).
- **Config** (`/dashboard/config`) — BurnLog-specific settings, moved here
  during the identity-consolidation work (see
  `docs/superpowers/specs/2026-08-31-identity-consolidation-design.md`):
  health metrics (BMI/BMR), level/XP/streak card, AI insights toggle, water
  tracking, meal-planner settings. Also hosts "Reonboard" (relaunches
  `/ai-setup`) and "Export config as JSON".
- **AI onboarding** (`/ai-setup`, outside this route group) — conversational
  setup that asks about goals/activity level and generates an initial
  workout plan.

Identity (avatar, name, username, email, default app) is **not** managed
here — that lives in LogBook's `/profile`. BurnLog's nav shows a **Config**
tab instead of a Profile tab.

## Routes

```
/dashboard              Dashboard (home)
/dashboard/config        BurnLog settings
/session                 Workout sessions
/goals                    Fitness goals
/insights                 Charts & trends
/meal-planner              AI meal planner
/meal-planner/grocery-list  Generated grocery list
```

## Data model

Prisma models (see `prisma/schema.prisma`): `FitnessGoal`, `Workout`,
`WorkoutPlan`, `Session`, `WeightEntry`, `CalorieBurn`, `FoodIntake`,
`StaminaSession`, `StepEntry`, `WaterEntry`, `Program`, `ProgramWeek`,
`MealPlanEntry`, `MealPlanCheckIn`. Shares the top-level `Profile` model with
every other app.

## Key files

```
app/(burnlog)/
  layout.tsx           Route-group layout/theming
  dashboard/            Dashboard page + config subpage
  session/               Workout logging
  goals/                  Goals
  insights/                Charts
  meal-planner/             Meal planner + grocery list
components/BottomNav.tsx    BurnLog's bottom nav (Home/Plan/Goals/Insights/Config)
```
