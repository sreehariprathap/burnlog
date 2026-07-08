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

type FullBodyLoggerProps = {
  userEquipment: string[];
  onEnd: (exerciseLog: Record<string, Record<string, boolean>>) => void;
};

export function FullBodyLogger({ userEquipment, onEnd }: FullBodyLoggerProps) {
  const [infoExercise, setInfoExercise] = useState<string | null>(null);

  const exercisesByGroup = useMemo(
    () => buildWorkoutExercises('Full Body', userEquipment, 3),
    [userEquipment]
  );

  const groups = Object.keys(exercisesByGroup);

  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: any = {};
    groups.forEach((g) => {
      init[g] = {};
      exercisesByGroup[g].forEach((ex) => { init[g][ex] = false; });
    });
    return init;
  });

  // At least 1 exercise per group
  const groupDone = groups.map((g) => Object.values(checks[g] ?? {}).some(Boolean));
  const sessionSuccess = groups.length > 0 && groupDone.every(Boolean);

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Full Body Session</CardTitle>
          {userEquipment.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Tailored to: {userEquipment.join(', ')}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-8">
          {groups.map((group, i) => (
            <div key={group} className="mb-6">
              <Label className="font-semibold text-lg mb-2 block">
                {group} {groupDone[i] && '✅'}
              </Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                {exercisesByGroup[group].map((ex) => (
                  <label key={ex} className="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                    <Checkbox
                      checked={checks[group]?.[ex] ?? false}
                      onCheckedChange={(val) =>
                        setChecks((prev) => ({
                          ...prev,
                          [group]: { ...prev[group], [ex]: !!val },
                        }))
                      }
                    />
                    <Image src={getExerciseImage(ex)} alt={ex} width={36} height={36} className="rounded-md flex-shrink-0" />
                    <span className={checks[group]?.[ex] ? 'line-through' : ''}>{ex}</span>
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

          <div className="flex justify-end mt-6">
            <Button onClick={() => onEnd(checks)} disabled={!sessionSuccess}>
              Finish Full Body
            </Button>
          </div>
        </CardContent>
      </Card>
      <ExerciseInfoModal exerciseName={infoExercise} onClose={() => setInfoExercise(null)} />
    </div>
  );
}
