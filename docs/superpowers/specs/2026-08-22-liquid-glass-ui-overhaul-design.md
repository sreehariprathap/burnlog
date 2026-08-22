# Liquid Glass UI Overhaul — Design

## Problem

The user wants to adopt a set of components from kokonutui.com and animate-ui.com to give the app an Apple-style "liquid glass" visual system: glass-styled cards, a floating dock nav, a global action search bar, a universal bottom-drawer pattern for all modals, a richer AI-loading state, an animated splash background, milestone celebration fireworks, a swipeable goals carousel, and a radial quick-log menu — plus removing the dashboard's push-notification prompt. This is ten largely-independent pieces; the user explicitly chose to cover all of them in one spec rather than split it up.

Two of the nine reference URLs didn't match what was asked for once actually fetched, so this design adapts rather than literally ports them:
- **"Floating dock"**: no such component exists in kokonutui's docs (confirmed 404 on every guessed URL). Built custom, using the same liquid-glass visual primitives as everything else.
- **"Radial Intro"**: the real component is a continuous auto-looping orbital animation (avatars drifting in a circle), not a click-triggered action menu. Built a custom click-triggered radial menu, borrowing its circular-arrangement math, not its looping-demo behavior.

## Global architecture decisions

- **New dependencies**: `vaul` (drawer primitive, powers Smooth Drawer) and `embla-carousel-react` (carousel engine, powers Motion Carousel). Neither is currently installed. `motion` (Framer Motion, already at `^13.1.1`) covers every other animation need across all nine pieces.
- **Component placement**: ported/adapted library components go in `components/kokonutui/` (matching the existing `apple-activity-card.tsx` precedent — hand-copied source, no package wrapper). The one new shadcn primitive (`Drawer`) goes in `components/ui/drawer.tsx`, matching where `dialog.tsx` etc. already live.
- **Liquid glass applied at the primitive, not per call-site**: rather than introducing a parallel `LiquidGlassCard` name and manually swapping every screen's `<Card>` usage, the glass treatment is built directly into the existing `components/ui/card.tsx` `Card` component. Every current `<Card>` usage across the app (dashboard widgets, goals trackers, profile cards) picks up the new look automatically, with zero call-site changes. `LiquidButton` is added as a new, separate opt-in export (not merged into the base `Button`) since only the floating dock and drawer primary actions need it — the user asked to update "cards and navbar," not every button in the app.
- **Nav and FAB keep their existing names/props**: `BottomNav` and `QuickLogFab` are rewritten internally (floating dock styling; radial menu instead of a Dialog list) but keep their exact current export names and prop shapes. Every page that already renders `<BottomNav />` or `<QuickLogFab profileId={...} onLogged={...} />` needs zero changes — this avoids touching 5+ pages just to swap a nav bar's visual style.

## 1. Liquid Glass Card system

New file `components/kokonutui/glass-filter.tsx`: the `GlassFilter` component — an SVG filter (`feTurbulence` + `feGaussianBlur` + `feDisplacementMap`) rendered inline per card instance via `useId()` (avoids ID collisions when many glass cards render on one page, per the source component's own approach).

`components/ui/card.tsx`'s `Card` component gains the glass treatment: `bg-background/20`, `backdrop-blur-[2px]`, a multi-layer inset-shadow system (separate light/dark constants, matching the original's two shadow sets), a `bg-gradient-to-r from-transparent via-black/5 to-transparent` hover overlay, and `filter: url(#${filterId})` referencing that card instance's `GlassFilter`. New optional props on `Card` (defaulting to the "on" state, matching current visual weight as closely as possible while adding the glass look): `glassSize?: 'sm' | 'default' | 'lg'` (padding), `glassEffect?: boolean` (lets a specific card opt out if the displacement filter proves too costly/distracting on a data-dense screen like the rings widget).

New file `components/kokonutui/liquid-button.tsx`: `LiquidButton`, extending the base `Button` with `active:scale-[0.97]`, hover `scale-105`, `duration-200`, and the same shadow/filter system as the card, with a `liquidVariant?: 'default' | 'none'` prop. Used in: the floating dock's tab buttons, the drawer's primary action buttons (Save/Finish/Start), and the radial menu's action buttons.

## 2. Floating dock navigation

`components/BottomNav.tsx` is rewritten in place (same export, same 5 routes — Home/Workout/Goals/Insights/Profile — same active-state logic via `pathname.startsWith`) to render as a floating pill: `fixed bottom-4 left-1/2 -translate-x-1/2`, wrapped in a `Card` (now glass by default per §1) with `rounded-full`, icons as `LiquidButton`s with the active tab getting a filled/highlighted state and a `layoutId`-based Framer Motion indicator that slides between tabs on navigation (matches the "liquid" continuity feel).

## 3. Action Search Bar

New file `components/kokonutui/action-search-bar.tsx`, adapted from the fetched spec (debounced `useDebounce` filtering at 200ms, arrow-key navigation, Enter to select, Escape to close, staggered Framer Motion item entrance).

Entry point: a new search icon added to `components/TopBar.tsx`'s existing `actions` slot, opening a full-screen overlay (matches the component's own dropdown-suggestion UX rather than cramming it into the top bar itself).

Actions list (the `Action[]` array passed in), covering every major cross-app action:
```
Log Calories       → opens the Log Calories drawer directly
Log Workout         → opens the Log Workout drawer directly
Log Steps           → opens the Log Steps drawer directly
Start Walk           → opens the Walk Tracker drawer directly
Track Weight         → navigates to /goals (weight tracker section/slide)
Set Goals            → navigates to /goals
Start Workout Session → navigates to /session
View Insights        → navigates to /insights
Manage AI Models      → navigates to /profile (admin only — filtered out of the actions array for non-admin users)
```
Since the quick-log actions now open drawers (not routes), the search bar component needs a way to trigger "open drawer X" from anywhere it's mounted — it's rendered once at the root layout level (or dashboard layout) alongside the drawer state, not duplicated per-page.

## 4. Smooth Drawer — universal modal/popup replacement

New file `components/ui/drawer.tsx`: the standard shadcn `Drawer` wrapper around `vaul` (`Drawer.Root/Trigger/Content/Header/Title/Description/Footer/Close`), with Framer Motion spring-physics slide-up (`y: "100%"` → `0` with a slight `rotateX`) and staggered child reveal (`0.07s` delay per item), matching the fetched spec.

**Every existing modal/popup in the app converts to this drawer**, per the "everything" scope decision:
- `app/dashboard/_components/quick-log/LogCaloriesModal.tsx`, `LogWorkoutModal.tsx`, `LogStepsModal.tsx`, `WalkTrackerModal.tsx` — currently hand-rolled `fixed inset-0` overlay divs; each becomes `<Drawer><DrawerContent>...same form contents...</DrawerContent></Drawer>`.
- `app/goals/_components/FoodScanner.tsx` — same conversion (currently also a hand-rolled fixed overlay).
- `app/profile/_components/AiModelSettingsModal.tsx`, `OnboardingPageTogglesModal.tsx` — currently `Dialog`-based; convert to `Drawer` for consistency (their `open`/`onOpenChange` prop contract is identical between Radix `Dialog` and `vaul`'s `Drawer`, so this is a low-risk swap).
- `QuickLogFab`'s own menu (§9, replaced by the radial menu, not a drawer) and the Action Search Bar's overlay (§3, its own full-screen pattern) are the two exceptions — everything else that currently pops up over the page becomes a `Drawer`.

## 5. Remove push notification prompt from dashboard

`app/dashboard/page.tsx`: delete the `PushNotificationPrompt` import and its render call. The component file itself (`app/dashboard/_components/PushNotificationPrompt.tsx`) is left in place but unused, since the underlying subscribe flow is still needed elsewhere (e.g. it's what makes the scheduled evening check-in reminders and admin test-push actually deliverable) — just no longer surfaced as a dashboard banner. If a subscribe entry point is still wanted later, that's a separate follow-up, not in scope here.

## 6. AI Loading component

New file `components/kokonutui/ai-loading.tsx`, adapted from the fetched spec (six-ring SVG progress spinner in the documented palette, scrolling code-style task log, `IntersectionObserver` pause-when-offscreen). The source component is self-contained with **no props** and hardcoded demo task text ("Searching the web," etc.) — adapted here to accept an optional `tasks?: string[][]` prop (array of task-sequence arrays, matching the original's internal structure) so callers can supply their own step labels, defaulting to the original demo tasks if omitted.

Replaces the `Loader2`-based loading blocks in the two big AI generators (per the "two big generators only" scope decision):
- `app/ai-setup/_components/AiSetupFlow.tsx` (workout plan generation) — tasks like `["Analyzing your lifestyle", "Building your weekly split", "Balancing recovery days"]`.
- `app/goals/_components/MealPlanWidget.tsx` (meal plan generation) — tasks like `["Reviewing your goals", "Planning your meals", "Building your grocery list"]`.

The smaller spinners (food-scan, workout-calorie AI estimate, admin model settings) are explicitly out of scope and keep their existing `Loader2` treatment.

## 7. Splash screen background

`components/SplashScreen.tsx` (existing: session-gated, 2000ms display, dark `#1a0f0a` background, radial-gradient glow div, `KineticText` "burnlog" wordmark). New file `components/kokonutui/background-paths.tsx`, adapted from the fetched spec (three layered groups of algorithmically-generated animated SVG paths, sine/cosine-based organic curves, Framer Motion vertical drift).

**Color adaptation for contrast** (explicit user requirement — "use our colors but make sure there's clear contrast"): the original component's default gradient is purple→pink→blue, which doesn't match the app and would be low-contrast against the splash screen's near-black backdrop. Replaced with the app's existing fire/amber accent palette already used throughout (`#F97316` orange, `#FBBF24` amber, `#EF4444` red) — bright warm tones against the `#1a0f0a` near-black background give strong, deliberate contrast rather than the muted default. Rendered behind the existing radial-glow div and `KineticText` content (inserted between the outer container and the glow div in `SplashScreen.tsx`), not replacing them — the paths add motion/texture, the existing glow and wordmark stay as the focal point.

Confirmed out of scope: `/login` and `/signup` keep their current plain centered-card layout — they're visually and structurally unrelated to the splash screen's full-bleed dark theme.

## 8. Fireworks celebration background

New file `components/kokonutui/fireworks-background.tsx`, adapted from the fetched spec (canvas-based, `population`/`color`/`fireworkSpeed`/`fireworkSize`/`particleSpeed`/`particleSize` props). Colors set to the same amber/orange/red palette as §7 for visual consistency across the celebratory surfaces.

**Trigger point**: `app/session/_components/CompletionTracker.tsx`, inside the existing `handleSubmit` streak/XP update block (currently computes `newStreak`, `newXp`, `computeLevel(newXp)`, and calls `setAchievement({ stats })`). Two new checks added right before that call:
- **Level up**: compare `computeLevel(newXp)` against the profile's level *before* this update — if it increased, flag `leveledUp: true`.
- **Streak milestone**: `newStreak % 7 === 0` (covers 7, 14, 30-ish via the 7-multiple check, plus explicitly also checking `newStreak === 100` for the round-number milestone) — if true, flag `streakMilestone: true`.

If either flag is set, the achievement object passed to `setAchievement` gains a `celebrate: true` field. Whatever component currently renders the achievement screen off `setAchievement`'s state renders `<FireworksBackground />` as a fixed-position overlay for ~3-4 seconds when `celebrate` is true, layered behind the existing achievement stats content (not blocking interaction with it).

## 9. Goals page carousel

New file `components/kokonutui/motion-carousel.tsx`, adapted from the fetched spec (Embla Carousel core + Framer Motion scale animation on the active slide + pill-style animated pagination dots). The original's `slides: number[]` prop is generic-by-design for its demo; adapted here to accept `slides: React.ReactNode[]` so each slide can render a different tracker component.

`app/goals/page.tsx` restructured: the current stacked-grid layout (GoalsList/AddGoal card, then a 2×2 grid of WeightTracker/CalorieTracker/FoodIntakeTracker/StaminaTracker, then MealPlanWidget) becomes one `MotionCarousel` with 6 slides, in this order (per the "everything, including the goals list" scope decision):
```
1. GoalsList + "Add Another Goal" (existing goal-CRUD section, now slide 1)
2. WeightTracker
3. CalorieTracker
4. FoodIntakeTracker
5. StaminaTracker
6. MealPlanWidget
```
Swipe or tap a pagination dot to move between them; each slide keeps its existing internal logic/markup unchanged — only the outer layout (grid → carousel) changes.

## 10. Radial quick-log menu

New file `components/kokonutui/radial-menu.tsx`: a custom click-triggered radial menu, visually inspired by Radial Intro's circular-arrangement math (items positioned via `sin`/`cos` around a center point at a fixed `stageSize`/orbit radius) but event-driven rather than auto-looping — items are hidden/collapsed at the center until triggered, then animate outward into their orbital positions via Framer Motion `AnimatePresence`, and animate back in on close or on selection.

`app/dashboard/_components/QuickLogFab.tsx` rewritten internally: tapping the "+" button no longer opens a `Dialog` with a stacked list — it triggers the `RadialMenu` with the same 4 actions (🍽️ Calories, 🏋️ Workout, 🚶 Steps, 🚶 Walk) arranged in an arc above/around the button. Tapping an action opens that action's `Drawer` (§4) exactly as today's flow does after selecting from the list — only the menu's presentation changes, not what happens after a selection. Component keeps its existing `{ profileId, onLogged }` prop contract.

## Error handling & edge cases

- **`vaul`/Embla on unsupported environments**: both are standard, widely-used libraries with no special SSR concerns beyond what Next.js already handles for `'use client'` components — no additional guards needed beyond the existing client-component boundaries.
- **Glass filter performance**: `feDisplacementMap` is GPU-intensive; the `glassEffect` opt-out prop on `Card` exists specifically so a data-dense screen (e.g. the rings widget re-rendering on every quick-log save) can disable the filter if it causes jank, without losing the rest of the glass visual treatment (blur/shadow/gradient stay either way).
- **Radial menu on small screens**: orbit radius/stage size must be computed relative to viewport width (not a fixed pixel value) so the arranged actions don't clip off-screen on narrow phones.
- **Fireworks + reduced motion**: should respect `prefers-reduced-motion` — skip both the fireworks canvas and the splash/dock/radial-menu Framer Motion animations (fall back to instant state changes) when that media query is set, since none of these animations are load-bearing for functionality.
- **Action Search Bar admin filtering**: the "Manage AI Models" action must be filtered out of the actions array for non-admin users client-side (same `profile.isAdmin` check already used to gate the admin cards on `/profile`), not just hidden — it shouldn't appear in search results for regular users at all.
- **Drawer conversion regressions**: since every existing modal is being touched, each converted component must be manually re-verified against its pre-conversion behavior (save/close/error states) — the conversion is meant to be visual-only, not a behavior change, so any drift is a bug to catch during implementation.

## Testing

No automated test suite exists in this repo; verification is manual, in-browser, per component:
- Liquid glass: visually inspect the dashboard, goals, and profile cards in both light and dark mode for the glass effect and readable contrast.
- Floating dock: confirm all 5 routes still navigate correctly, active-tab indicator animates between tabs.
- Action search bar: open via the TopBar icon, confirm filtering, arrow-key navigation, Enter-to-select, and that each action does what it says (drawer opens or navigation happens); confirm admin-only action is hidden for non-admin accounts.
- Drawers: for each converted modal, confirm open/close, save success, save error (inline error still shows), and that closing without saving discards state exactly as before conversion.
- AI loading: trigger meal-plan and workout-plan generation, confirm the new loading state renders and transitions to the result correctly on completion and on error.
- Splash background: reload the app fresh (clear the session-storage gate) and confirm the animated paths render behind the wordmark with visible contrast against the dark background.
- Fireworks: complete a session that triggers a level-up or a streak-milestone (e.g. manually set `currentStreak` to 6 via SQL and complete one more session) and confirm the fireworks overlay appears; complete an ordinary session and confirm it does *not* appear.
- Goals carousel: swipe between all 6 slides on a touch device (or drag on desktop), confirm pagination dots track the active slide, confirm each slide's existing functionality (add goal, log weight, etc.) still works unchanged inside the carousel.
- Radial menu: tap the dashboard "+" button, confirm the 4 actions animate outward, tap one, confirm the correct drawer opens; confirm tapping outside or a close action collapses the menu back to the center.
