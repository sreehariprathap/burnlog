# Walk Tracker Mode — Design

## Problem

The user wants steps tracked automatically instead of manual entry, and asked whether the app can "connect to the phone and sync" step data. It can't — Apple HealthKit and Google Fit are not reachable from a web PWA under any circumstances; that data is native-app-only. The closest a web app can get is: keep the tab in the foreground and read the phone's raw accelerometer (`DeviceMotion`) directly, running our own step-detection heuristic on it. This spec covers that — a live "Walk" tracking session, not a background sync.

## Goals

- Let a user start a live walk session from the dashboard, see step count and elapsed time update in real time while the app is open, and finish it to log steps + duration + an estimated calorie burn in one action.
- Degrade gracefully everywhere DeviceMotion isn't available or permission is denied — never block completing a session.

## Non-goals

- Background tracking (app closed/backgrounded) — technically impossible via web APIs on iOS; not attempted.
- True pedometer-grade accuracy — this is a heuristic peak-detector on raw accelerometer data, not a calibrated step counter.
- Syncing with Apple Health / Google Fit — no such capability exists for PWAs.

## Architecture

New quick-log entry point, not tied to the existing weekly session planner (`/session`, `SessionLogger`, `AddWorkoutModal`) — that system is built around planned Push/Pull/Legs/Cardio days gated behind a pre-set `workout_plans` row for today, which doesn't fit a spontaneous walk. Instead:

- **4th `QuickLogFab` option**: "🚶 Start Walk", alongside the existing Calories/Workout/Steps options (`app/dashboard/_components/QuickLogFab.tsx`).
- New component `app/dashboard/_components/quick-log/WalkTrackerModal.tsx` — a full-screen overlay (same fixed-inset pattern as `FoodScanner.tsx` and the other quick-log modals), not a small form dialog, since this needs a live, prominent, glanceable display while walking.
- On finish, writes directly to `step_entries` (steps) and `calorie_burns` (duration + calorie estimate) — the same tables the existing `LogStepsModal` and `LogWorkoutModal` already write to, so the dashboard's `DailyRingsWidget` picks up all three affected rings (steps, workout minutes, burn) automatically with no widget changes needed.

## Live tracking flow

1. **Start**: user taps "Start". On iOS (`typeof DeviceMotionEvent.requestPermission === 'function'`), this same tap triggers `DeviceMotionEvent.requestPermission()` (required: must be inside a user-gesture handler, cannot be requested ahead of time). On grant (or on Android/other browsers where no permission prompt exists), begin tracking:
   - `startTime = Date.now()`
   - `setInterval` every second, redrawing elapsed time as `Date.now() - startTime` (not an incrementing counter — stays accurate even if the interval itself gets throttled by the browser).
   - `window.addEventListener('devicemotion', handleMotion)`.
2. **Step detection** (`handleMotion`): reads `event.accelerationIncludingGravity` (widely supported, no calibration needed), computes magnitude `√(x²+y²+z²)`, and increments the step counter on each upward threshold-crossing (peak) that's at least ~250ms after the last counted step (debounce, prevents double-counting within a single stride's acceleration spike). Thresholds are tuned constants, not adaptive — documented as an approximation.
3. **Live display**: large `mm:ss` timer and step count, updating continuously.
4. **Finish**: user taps "Finish" (disabled for the first few seconds to prevent instant zero-length sessions). Stop the interval and remove the `devicemotion` listener. Compute:
   - `durationMinutes = round((Date.now() - startTime) / 60000)`
   - `steps` = live-counted total, or the manually-entered fallback value (see below)
   - `caloriesBurned` = a fixed MET-based estimate computed client-side (no AI call): `caloriesBurned = round(3.5 * weightKg * (durationMinutes / 60))` using MET 3.5 for brisk walking and a default `weightKg = 70` (matches the existing fallback default used elsewhere in the AI routes, e.g. `scan-food`/`meal-plan`).
5. Writes one row to `step_entries` (`profileId`, `steps`) and one row to `calorie_burns` (`profileId`, `activityType: 'Walking'`, `duration: durationMinutes`, `caloriesBurned`), then calls the same `onSaved()` → `refreshKey` bump contract every other quick-log modal already uses.

## Fallback path

If `DeviceMotion` events never fire (most desktop browsers, or permission denied on iOS), the timer still runs normally, but the step counter is replaced with a manual number input at the Finish screen — the user types their estimated step count instead of it being live-counted. This mirrors the existing AI-optional-with-manual-fallback pattern already used in `LogCaloriesModal` and `LogWorkoutModal`.

## Error handling & edge cases

- Backgrounding the tab/app mid-walk: `devicemotion` stops firing (iOS suspends sensor access for backgrounded tabs) — step count simply stops incrementing until foregrounded again; the timer display remains accurate regardless (computed from wall-clock `Date.now()`, not tick count).
- Closing the modal mid-session without tapping Finish discards the session entirely — no partial/auto-save, consistent with how every other quick-log modal behaves on close.
- `DeviceMotionEvent.requestPermission()` rejected → immediately falls back to the manual step-entry path; the walk/timer still proceeds normally.
- "Finish" is disabled until a minimum elapsed time (a few seconds) has passed, preventing accidental zero-length log entries.
- Both inserts (`step_entries`, `calorie_burns`) happen in the same save action; if one fails, surface an inline error (matching the existing modals' `error` state pattern) and allow retry without losing the already-computed session numbers.

## Testing

No automated test suite exists in this repo. Manual verification:
- On a real phone: start a walk, physically walk a short measurable distance, confirm the live step count roughly tracks actual steps taken and the timer is accurate to the second.
- Finish the session and confirm both `step_entries` and `calorie_burns` rows are written with sane values, and that the dashboard's steps, workout-minutes, and burn rings all update.
- On desktop Chrome (no motion sensor): confirm graceful fallback to manual step entry, timer still works.
- On iOS: confirm the permission prompt appears on the Start tap, and that denying it falls back correctly without crashing.
- Background the tab mid-walk on a phone, return to it, confirm the timer is still correct and the app didn't crash or lose the session.
