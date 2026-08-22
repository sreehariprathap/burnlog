# Plan Meals/Monthly Rollup, Profile Dropdown, Weekday Tabs, Splash Screen, Water Tracker — Design

> Six independent pieces requested together. Each has its own heading
> below acting as a self-contained mini-spec; they share one
> implementation plan since none are individually large enough to
> warrant a separate roadmap document (contrast with the 8-week Program
> work in `2026-08-22-plan-page-roadmap.md`, which is a genuinely large
> multi-phase initiative — this is not that).

## 1. Plan Day view: meals + daily goals

**Problem:** The Plan page's Day view only shows the workout card/checklist — no visibility into today's meals, calories, or step progress, even though that data (and a widget for it) already exists.

**Design:** Embed the existing `app/dashboard/_components/DailyRingsWidget.tsx` into the Plan page's Day view, for **today only** — it already fetches `calorie_burns`/`food_intakes`/`step_entries` for the current day and renders burn/eat/move/steps rings against `fitness_goals`-resolved targets (`lib/dailyTargets.ts`). No new component, no new data model. For non-today dates (rendered via `PlanDaySummary`), this widget is *not* shown — it's an inherently "right now" widget (live rings, not historical), consistent with `PlanDaySummary`'s existing read-only/historical framing.

**Placement:** Below the existing `PlanCard`/`WorkoutChecklist` block, only in the `isSameLocalDay(selectedDate, today)` branch of `app/session/page.tsx`.

## 2. Plan Month view: monthly activity rollup

**Problem:** The Month calendar shows per-day workout status but nothing about cumulative progress against monthly nutrition/activity goals.

**Design:** New `PlanMonthActivitySummary` component, rendered inside `PlanMonthCalendar` above the calendar grid. For the displayed month:
- Sum `calorie_burns.caloriesBurned`, `food_intakes.calories`, and `step_entries.steps` across all days in the month up to and including today (or the whole month if `displayMonth` is fully in the past).
- Compare each sum against `resolveTarget(goals, goalType) * daysElapsedInDisplayedMonth` (reusing `lib/dailyTargets.ts`'s existing per-day targets and default-target fallback — "if all plan goes well perfectly" is literally today's target × days elapsed, per the user's own framing).
- Render three compact progress bars (Burn / Eat / Steps) with a percentage, styled consistently with `DailyRingsWidget`'s color language but as bars, not rings (a ring per bar would visually compete with the calendar grid below it — bars read faster at a glance in a secondary position).

**Data needed:** `fitness_goals` for the profile (already fetched elsewhere; `PlanMonthCalendar` will need its own small fetch or receive it as a prop — implementation-plan detail).

## 3. Profile dropdown menu

**Problem:** Tapping "Profile" in the bottom nav always navigates straight to `/profile`. The user wants a dropdown with "Profile" and "Log Out" now, extensible for more items later (mirroring kokonutui's profile-dropdown pattern, but scoped down — no avatar/subscription/model-badge sections needed).

**Design:** New `components/ProfileMenu.tsx` replacing the Profile entry in `components/BottomNav.tsx`'s `tabs` array. Visually: same icon (`UserIcon`) + "Profile" label + active-state pill exactly as today, but wrapped in a dropdown trigger instead of a `<Link>`. Opens **upward** (the nav is pinned to the bottom of the screen) via shadcn's `DropdownMenu` primitive (check `components/ui/` for an existing `dropdown-menu.tsx` before adding a new dependency — if absent, install `@radix-ui/react-dropdown-menu` following the same pattern used for `@radix-ui/react-avatar` in the profile-avatar work).

**Menu items (v1):**
- "Profile" → `router.push('/profile')`
- "Log Out" → `supabase.auth.signOut()` then `router.push('/login')` (same logic as `app/profile/page.tsx`'s existing `handleLogout`, duplicated here rather than shared — it's two lines, not worth a shared hook for this session's scope)

Designed so a future item is just another `DropdownMenuItem` — no structural rework needed later.

## 4. Weekday tabs restyle

**Problem:** The Plan page's `DayNavigator` (Mon–Sun weekday picker) is a plain button row with a solid-color active state — no animation, doesn't match the app's now-established "smooth sliding highlight" visual language (`SmoothTabs`, `PlanViewToggle`).

**Design:** New `WeekdayTabs` component modeled on Aceternity's Tabs pattern (distinct from `SmoothTabs` — that one is icon-only pills for the Goals/Plan-view toggles; this one needs text labels "Mon"..."Sun" and is the *third* tab-like component in this codebase, which is acceptable since each serves a visually/functionally distinct case: icon-only pill row, two-item view switch, and a 7-item text-label weekday picker). Sliding highlight background via a shared Framer Motion `layoutId` (same technique `SmoothTabs` already uses), plus a hover-preview treatment (a fainter background on the hovered-but-not-active tab, matching Aceternity's described "background animation on click/hover"). Replaces `DayNavigator` as the Plan page's weekday picker — same `value`/`onChange` contract so the rest of `app/session/page.tsx`'s wiring (weekday → `selectedDate` sync) doesn't need to change.

**Not doing:** Aceternity's Tabs also supports per-tab `content` with fade transitions between entirely different content blocks. That's not needed here — this is a value picker (weekday number), not a content switcher; the *existing* Day-view content below it doesn't need to be restructured as tab `content`.

## 5. Splash screen: light/dark specific backgrounds

**Problem:** `components/SplashScreen.tsx` always renders a fixed dark background (`#1a0f0a`) regardless of the resolved theme, with `BackgroundPaths` behind the "burnlog" kinetic-text branding. The user wants theme-specific animated backgrounds: a wavy background for light mode, a shader-style effect for dark mode.

**Design:**
- New `components/kokonutui/wavy-background.tsx`: canvas-rendered animated sine waves (Aceternity's approach — canvas, not SVG/CSS), recolored to the app's brand palette (`#FF9E4F`, `#F97316`, `#EF4444`, `#B55233` — the same warm palette already used for the Card glow and avatar-initials colors, not Aceternity's default cyan/purple/magenta, to stay on-brand) against a light background fill.
- New `components/kokonutui/lines-gradient-shader.tsx`: canvas-rendered animated moving gradient lines (approximating Aceternity's "Lines Gradient" shader — no exact source was available to port, so this is a from-scratch canvas implementation in the same visual spirit, not a pixel port), also in the brand palette, against a dark fill.
- `SplashScreen.tsx` picks between them based on the resolved theme, using the same `document.documentElement.classList.contains('dark')` detection pattern `ThemeToggle` already uses (avoids a hook dependency ordering issue with `ThemeProvider` during the earliest possible paint).
- The existing `KineticText` "burnlog" + "Track the burn" tagline overlay is unchanged — it's the "cool text" already in place and works well in both themes; only the background layer changes.
- `BackgroundPaths` (currently used unconditionally) is removed from `SplashScreen` in favor of the two new theme-specific backgrounds. Confirmed via grep: `components/kokonutui/background-paths.tsx` has no other call site in the codebase, so it becomes dead code and is deleted in the same task, per the pattern already established when the liquid-glass files (`glass-filter.tsx`, `liquid-button.tsx`) were deleted earlier this session.

## 6. Water intake tracker

**Problem:** No water tracking exists anywhere in the schema. The user wants it treated as a "major" tracked metric — visible on the dashboard, unit-customizable (glasses or liters).

**Data model (new):**
```prisma
model WaterEntry {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  date      DateTime @db.Date
  amountMl  Int      @default(0)

  @@unique([profileId, date])
  @@map("water_entries")
}
```
One row per profile per day (not one row per glass logged) — the tracker is a running counter for the day, upserted on every +/- tap (`onConflict: 'profileId,date'`), matching the increment/decrement interaction model of the reference component rather than an append-only log.

`Profile` gains three new fields:
```prisma
  waterUnit    String @default("glasses") // "glasses" | "liters"
  glassSizeMl  Int    @default(250)
  waterGoalMl  Int    @default(2000)
```

**Component:** `WaterIntakeTracker` (new, `components/kokonutui/water-intake-tracker.tsx`), adapting kokonutui's team-selector interaction pattern: a centered counter (glasses: whole-number count derived from `amountMl / glassSizeMl`, rounded; liters: `amountMl / 1000` to one decimal place) flanked by +/− buttons, spring-animated count transitions, shake-on-limit feedback if decrementing below 0 or incrementing past a sane cap (e.g. 20 glasses / 5L), respecting `useReducedMotion`. Stacked water-glass/droplet icons (in place of the reference's stacked avatars) fill in up to the day's goal, matching the "team size" visual metaphor with a fitness-appropriate icon set (`GlassWater` or similar from `lucide-react`).

**Placement:** Dashboard (new widget in the "Today's Activity" area, alongside `DailyRingsWidget`) and Plan Day view (today only, alongside the newly-embedded `DailyRingsWidget` from section 1) — both read/write the same `WaterEntry` row for today, so logging from either place stays in sync (both just refetch/upsert against `(profileId, today)`).

**Profile settings:** A new small settings block on `app/profile/page.tsx` — a unit toggle (glasses/liters) and number inputs for `glassSizeMl` and `waterGoalMl`, persisted via a direct `profiles` update (matching the existing `ProfileAvatar`/other profile-page patterns — client-side Supabase writes, no new API route).

## Testing (all six pieces)

No automated test framework in this repo. Manual verification per piece: `npx tsc --noEmit` after every task, plus in-browser checks (Chrome DevTools MCP) in both light and dark mode. The water tracker's schema change needs `npx prisma db push` applied live (same pattern as `Profile.avatarUrl`/`Profile.lastConsistencyBonusWeek` earlier this session) before any UI work touching it can be verified end-to-end.

## Explicitly out of scope

- The full 8-week Program model (separate roadmap, Phase 3/4 — this spec's "meals" addition is the existing daily-rings widget, not a Program-driven meal plan).
- Water reminders/notifications (could hook into the existing cron/push infra later, not requested now).
- Historical water-intake charts/trends (only today's counter is in scope; a graph is a future addition once there's meaningful history).
