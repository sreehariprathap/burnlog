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
