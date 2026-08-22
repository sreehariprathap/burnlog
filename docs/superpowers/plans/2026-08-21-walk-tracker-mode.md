# Walk Tracker Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th quick-log option, "Start Walk", that live-tracks elapsed time and step count (via the phone's accelerometer, foreground-only) and logs both a `step_entries` row and a `calorie_burns` row on finish.

**Architecture:** A new full-screen overlay component (`WalkTrackerModal`), matching the existing quick-log modal pattern (`LogStepsModal`, `LogWorkoutModal`), wired in as a 4th `QuickLogFab` option. No backend changes — writes go straight to the same two tables the existing Log Steps and Log Workout modals already use, so `DailyRingsWidget` picks up the new rows automatically with zero widget changes. No HealthKit/Google Fit integration is possible from a PWA; this is `DeviceMotion`-based estimation while the tab is foregrounded, with manual entry as the fallback when the sensor isn't available.

**Tech Stack:** Next.js 15 (App Router), React 19, `@supabase/auth-helpers-nextjs` (`createClientComponentClient`), browser `DeviceMotionEvent` API, `components/ui/*`.

## Global Constraints

- No automated test framework exists in this repo. Verification is manual: `npx tsc --noEmit` after every task, plus in-browser testing (ideally on a real phone for the motion sensor; desktop Chrome to confirm the manual-entry fallback).
- Follow the existing quick-log modal contract exactly: `{ profileId: string; onClose: () => void; onSaved: () => void }` props, fixed-inset overlay styling (`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4`), `Card`/`CardContent` from `components/ui/card`, inline `error` state rendered as `<p className="text-sm text-red-500">`.
- `DeviceMotionEvent.requestPermission` is a non-standard Safari-only extension not present in TypeScript's default DOM lib types — code must feature-detect it via a type guard rather than assuming its presence, and must call it synchronously inside the user-gesture handler (the Start button's `onClick`), not after an `await` boundary, or Safari will silently ignore the permission request.

---

### Task 1: `WalkTrackerModal` component

**Files:**
- Create: `app/dashboard/_components/quick-log/WalkTrackerModal.tsx`

**Interfaces:**
- Produces: `WalkTrackerModal({ profileId, onClose, onSaved }: { profileId: string; onClose: () => void; onSaved: () => void })` — a React component. On finish, inserts one row into `step_entries` (`profileId`, `steps`) and one row into `calorie_burns` (`profileId`, `activityType: 'Walking'`, `duration`, `caloriesBurned`), then calls `onSaved()`. Matches the exact prop contract of `LogStepsModal`/`LogWorkoutModal` so it can be dropped into `QuickLogFab` without any adapter code.

- [ ] **Step 1: Write the component**

```tsx
// app/dashboard/_components/quick-log/WalkTrackerModal.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type WalkTrackerModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

const WALK_MET = 3.5; // MET value for brisk walking
const DEFAULT_WEIGHT_KG = 70;
const STEP_THRESHOLD = 11; // m/s^2 — accelerationIncludingGravity magnitude peak indicating a step
const STEP_DEBOUNCE_MS = 250;
const MIN_FINISH_SECONDS = 5;

type MotionPermissionCtor = { requestPermission: () => Promise<'granted' | 'denied'> };

function hasMotionPermissionApi(ctor: unknown): ctor is MotionPermissionCtor {
  return (
    typeof ctor === 'object' &&
    ctor !== null &&
    'requestPermission' in ctor &&
    typeof (ctor as { requestPermission?: unknown }).requestPermission === 'function'
  );
}

export function WalkTrackerModal({ profileId, onClose, onSaved }: WalkTrackerModalProps) {
  const supabase = createClientComponentClient();
  const [tracking, setTracking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [steps, setSteps] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motionSupported, setMotionSupported] = useState(true);

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStepAtRef = useRef(0);

  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
    const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    const now = Date.now();
    if (magnitude > STEP_THRESHOLD && now - lastStepAtRef.current > STEP_DEBOUNCE_MS) {
      lastStepAtRef.current = now;
      setSteps((prev) => prev + 1);
    }
  };

  const startTracking = async () => {
    setError(null);

    const MotionCtor = (window as unknown as { DeviceMotionEvent?: unknown }).DeviceMotionEvent;

    if (hasMotionPermissionApi(MotionCtor)) {
      try {
        const result = await MotionCtor.requestPermission();
        if (result !== 'granted') {
          setMotionSupported(false);
        }
      } catch {
        setMotionSupported(false);
      }
    } else if (!MotionCtor) {
      setMotionSupported(false);
    }

    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleMotion);
    }

    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setSteps(0);
    setTracking(true);

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  };

  const stopTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.removeEventListener('devicemotion', handleMotion);
    setTracking(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('devicemotion', handleMotion);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinish = async () => {
    stopTracking();
    setError(null);

    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const caloriesBurned = Math.round(WALK_MET * DEFAULT_WEIGHT_KG * (durationMinutes / 60));

    setSaving(true);
    try {
      const [stepsResult, burnResult] = await Promise.all([
        supabase.from('step_entries').insert([{ profileId, steps }]),
        supabase.from('calorie_burns').insert([
          { profileId, activityType: 'Walking', duration: durationMinutes, caloriesBurned },
        ]),
      ]);

      if (stepsResult.error) throw stepsResult.error;
      if (burnResult.error) throw burnResult.error;

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save walk');
    } finally {
      setSaving(false);
    }
  };

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');
  const showIdleScreen = !tracking && elapsedSeconds === 0;
  const canFinish = tracking && elapsedSeconds >= MIN_FINISH_SECONDS;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">🚶 Walk Tracker</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {showIdleScreen ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-sm text-muted-foreground">
                Keep burnlog open while you walk — steps are estimated from your phone&apos;s motion sensor.
              </p>
              <Button onClick={startTracking} className="w-full">
                Start Walk
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-4xl font-bold tabular-nums">{mm}:{ss}</p>
                <p className="text-xs text-muted-foreground mt-1">elapsed time</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="steps">
                  Steps {motionSupported ? '(live)' : '(enter manually — motion sensor unavailable)'}
                </Label>
                <Input
                  id="steps"
                  type="number"
                  value={steps}
                  onChange={(e) => setSteps(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button onClick={handleFinish} disabled={!canFinish || saving} className="w-full">
                {saving ? 'Saving...' : 'Finish'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification (standalone)**

Run: `npx tsc --noEmit`
Expected: no new type errors, including on the `DeviceMotionEvent` permission type guard.

This component isn't reachable from the UI yet — full interactive verification happens in Task 2 once it's wired into `QuickLogFab`.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/_components/quick-log/WalkTrackerModal.tsx
git commit -m "feat: add live Walk tracker modal (accelerometer step counting)"
```

---

### Task 2: Wire into `QuickLogFab`

**Files:**
- Modify: `app/dashboard/_components/QuickLogFab.tsx`

**Interfaces:**
- Consumes: `WalkTrackerModal` (Task 1).
- Produces: `QuickLogFab`'s menu now has 4 options; `ModalKey` type gains `'walk'`.

- [ ] **Step 1: Add the import and menu option**

In `app/dashboard/_components/QuickLogFab.tsx`, add the import next to the other quick-log modal imports:

```tsx
import { WalkTrackerModal } from './quick-log/WalkTrackerModal';
```

Widen the `ModalKey` type:

```tsx
type ModalKey = 'menu' | 'calories' | 'workout' | 'steps' | 'walk' | null;
```

Add a 4th button inside the menu's `<div className="grid gap-2 pt-2">`, after the existing "Log Steps" button:

```tsx
            <Button variant="outline" className="justify-start" onClick={() => setOpen('walk')}>
              🚶 Start Walk
            </Button>
```

Add the conditional render next to the other three, after the `open === 'steps'` block:

```tsx
      {open === 'walk' && (
        <WalkTrackerModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

With the dev server running, on the dashboard:
1. Tap the "+" button — confirm 4 options now appear, including "🚶 Start Walk".
2. Tap it, tap "Start Walk" — on a phone, confirm the iOS motion-permission prompt appears (if applicable) and the live timer/step count begins updating; on desktop Chrome, confirm it falls back gracefully (timer runs, steps field stays manually editable, no crash, `motionSupported` label reflects the fallback).
3. On a real phone: physically walk a short distance with the tab foregrounded, confirm the step count increases roughly in line with actual steps and the timer stays accurate.
4. Tap "Finish" before `MIN_FINISH_SECONDS` has elapsed — confirm the button is disabled and nothing is saved.
5. Wait past the minimum, tap "Finish" — confirm the modal closes, and the dashboard's `DailyRingsWidget` steps, workout-minutes, and burn rings all update without a page reload.
6. Background the tab mid-walk on a phone (switch apps), return to it, confirm the timer is still correct (computed from wall-clock time, not a naive tick counter) and the session isn't lost.
7. Close the modal mid-walk without tapping Finish — confirm nothing was written to `step_entries` or `calorie_burns` (verify via `mcp__supabase__execute_sql` if convenient: `select * from step_entries order by "createdAt" desc limit 3;`).

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/_components/QuickLogFab.tsx
git commit -m "feat: wire Walk tracker into the quick-log menu"
```
