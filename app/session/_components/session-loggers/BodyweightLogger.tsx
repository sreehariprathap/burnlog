/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useMemo } from 'react';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ExerciseInfoModal } from '../ExerciseInfoModal';
import { buildWorkoutExercises } from '@/lib/exercises';

type BodyweightLoggerProps = {
  userEquipment: string[];
  onEnd: (exerciseLog: Record<string, Record<string, boolean>>) => void;
};

export function BodyweightLogger({ userEquipment, onEnd }: BodyweightLoggerProps) {
  const [infoExercise, setInfoExercise] = useState<string | null>(null);

  // Build exercises from the DB — includes bodyweight items plus any home gear the user has
  const exercisesByGroup = useMemo(
    () => buildWorkoutExercises('Bodyweight', userEquipment),
    [userEquipment]
  );

  const categories = Object.keys(exercisesByGroup);

  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: any = {};
    categories.forEach((c) => {
      init[c] = {};
      exercisesByGroup[c].forEach((ex) => { init[c][ex] = false; });
    });
    return init;
  });

  const catDone = categories.map((c) => Object.values(checks[c] ?? {}).filter(Boolean).length >= 3);
  const sessionSuccess = categories.length > 0 && catDone.every(Boolean);

  const hasHomeGear = userEquipment.filter(
    (e) => !['None (bodyweight only)', 'Dumbbells', 'Barbell', 'Cardio Machine'].includes(e)
  );

  return (
    <div className="p-6">
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl">🏠 Bodyweight Session</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {hasHomeGear.length > 0
              ? `Using: ${hasHomeGear.join(', ')}`
              : 'No equipment needed — anywhere, anytime.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">No exercises found. Check your profile equipment settings.</p>
          )}
          {categories.map((cat, i) => (
            <div key={cat} className="mb-6">
              <Label className="text-lg font-semibold mb-3 flex items-center">
                {cat} {catDone[i] && <span className="ml-2 text-green-500">✅</span>}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {exercisesByGroup[cat].map((ex) => (
                  <label
                    key={ex}
                    className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
                  >
                    <Checkbox
                      checked={checks[cat]?.[ex] ?? false}
                      onCheckedChange={(val) =>
                        setChecks((prev) => ({
                          ...prev,
                          [cat]: { ...prev[cat], [ex]: !!val },
                        }))
                      }
                      className="h-5 w-5"
                    />
                    <span className={checks[cat]?.[ex] ? 'line-through opacity-60' : ''}>{ex}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoExercise(ex); }}
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
