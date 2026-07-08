/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ExerciseInfoModal } from '../ExerciseInfoModal';

type BodyweightLoggerProps = {
  onEnd: (exerciseLog: Record<string, Record<string, boolean>>) => void;
};

const bodyweightExercises: Record<string, string[]> = {
  'Upper Body': [
    'Push-Ups',
    'Wide Push-Ups',
    'Diamond Push-Ups',
    'Pike Push-Ups',
    'Tricep Dips (chair)',
    'Plank Shoulder Taps',
  ],
  Core: [
    'Plank (30–60s)',
    'Mountain Climbers',
    'Bicycle Crunches',
    'Leg Raises',
    'Russian Twists',
    'Dead Bug',
  ],
  'Lower Body': [
    'Bodyweight Squats',
    'Reverse Lunges',
    'Glute Bridges',
    'Wall Sit (45s)',
    'Calf Raises',
    'Jump Squats',
  ],
  Cardio: [
    'Burpees',
    'High Knees (30s)',
    'Jumping Jacks',
    'Skaters',
    'Star Jumps',
    'Inchworms',
  ],
};

export function BodyweightLogger({ onEnd }: BodyweightLoggerProps) {
  const [infoExercise, setInfoExercise] = useState<string | null>(null);
  const muscles = Object.keys(bodyweightExercises);

  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: any = {};
    muscles.forEach((m) => {
      init[m] = {};
      bodyweightExercises[m].forEach((ex) => {
        init[m][ex] = false;
      });
    });
    return init;
  });

  const muscleDone = muscles.map(
    (m) => Object.values(checks[m]).filter((v) => v).length >= 3
  );
  const sessionSuccess = muscleDone.every(Boolean);

  return (
    <div className="p-6">
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl">🏠 Bodyweight Session</CardTitle>
          <p className="text-sm text-muted-foreground">No equipment needed — anywhere, anytime.</p>
        </CardHeader>
        <CardContent className="space-y-8">
          {muscles.map((muscle, i) => (
            <div key={muscle} className="mb-6">
              <Label className="text-lg font-semibold mb-3 flex items-center">
                {muscle} {muscleDone[i] && <span className="ml-2 text-green-500">✅</span>}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {bodyweightExercises[muscle].map((ex) => (
                  <label
                    key={ex}
                    className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
                  >
                    <Checkbox
                      checked={checks[muscle][ex]}
                      onCheckedChange={(val) =>
                        setChecks((prev) => ({
                          ...prev,
                          [muscle]: { ...prev[muscle], [ex]: !!val },
                        }))
                      }
                      className="h-5 w-5"
                    />
                    <span className={checks[muscle][ex] ? 'line-through opacity-60' : ''}>{ex}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setInfoExercise(ex);
                      }}
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      aria-label={`How to do ${ex}`}
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-4">
            <Button onClick={() => onEnd(checks)} disabled={!sessionSuccess} className="px-6">
              {sessionSuccess ? 'Finish Session 🎉' : 'Complete 3 per category'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ExerciseInfoModal exerciseName={infoExercise} onClose={() => setInfoExercise(null)} />
    </div>
  );
}
