/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getExerciseImage } from '@/lib/exerciseImages';
import { ExerciseInfoModal } from '../ExerciseInfoModal';
import { buildWorkoutExercises } from '@/lib/exercises';

type PushPullLegLoggerProps = {
  bodyPart: 'Push' | 'Pull' | 'Legs';
  userEquipment: string[];
  onEnd: (exerciseLog: Record<string, Record<string, boolean>>) => void;
};

export function PushPullLegLogger({ bodyPart, userEquipment, onEnd }: PushPullLegLoggerProps) {
  const [infoExercise, setInfoExercise] = useState<string | null>(null);

  // Build exercise list from the master DB, filtered by what the user actually has
  const exercisesByMuscle = useMemo(
    () => buildWorkoutExercises(bodyPart, userEquipment),
    [bodyPart, userEquipment]
  );

  const muscles = Object.keys(exercisesByMuscle);

  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: any = {};
    muscles.forEach((m) => {
      init[m] = {};
      exercisesByMuscle[m].forEach((ex) => { init[m][ex] = false; });
    });
    return init;
  });

  const muscleDone = muscles.map((m) => Object.values(checks[m] ?? {}).filter(Boolean).length >= 3);
  const sessionSuccess = muscles.length > 0 && muscleDone.every(Boolean);

  return (
    <div className="p-6">
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl">{bodyPart} Session</CardTitle>
          {userEquipment.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Exercises selected for your equipment: {userEquipment.join(', ')}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-8">
          {muscles.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No exercises found for your current equipment. Try adding equipment in your profile settings.
            </p>
          )}
          {muscles.map((muscle, i) => (
            <div key={muscle} className="mb-6">
              <Label className="text-lg font-semibold mb-3 flex items-center">
                {muscle} {muscleDone[i] && <span className="ml-2 text-green-500">✅</span>}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                {exercisesByMuscle[muscle].map((ex) => (
                  <label key={ex} className="flex items-center space-x-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md">
                    <Checkbox
                      checked={checks[muscle]?.[ex] ?? false}
                      onCheckedChange={(val) =>
                        setChecks((prev) => ({
                          ...prev,
                          [muscle]: { ...prev[muscle], [ex]: !!val },
                        }))
                      }
                      className="h-5 w-5"
                    />
                    <Image src={getExerciseImage(ex)} alt={ex} width={36} height={36} className="rounded-md flex-shrink-0" />
                    <span className={checks[muscle]?.[ex] ? 'line-through opacity-70' : ''}>{ex}</span>
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

          <div className="flex justify-end pt-4 mt-6">
            <Button onClick={() => onEnd(checks)} disabled={!sessionSuccess} className="px-6 py-2">
              {sessionSuccess ? 'Finish Session 🎉' : 'Complete 3 per muscle'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ExerciseInfoModal exerciseName={infoExercise} onClose={() => setInfoExercise(null)} />
    </div>
  );
}
