/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { getExerciseImage } from '@/lib/exerciseImages';
import { ExerciseInfoModal } from '../ExerciseInfoModal';

type CardioLoggerProps = { onEnd: (exerciseLog: { minutes: number; activities: Record<string, boolean> }) => void };

const cardioOptions = ['Running','Cycling','Rowing','Elliptical','Other'];

export function CardioLogger({ onEnd }: CardioLoggerProps) {
  const [infoExercise, setInfoExercise] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string,boolean>>(() => {
    const init: any = {};
    cardioOptions.forEach(opt => (init[opt] = false));
    return init;
  });
  const [minutes, setMinutes] = useState<number>(0);
  const sessionSuccess = minutes > 0 || Object.values(checks).some(v => v);

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Cardio Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2">
            <Label>Minutes</Label>
            <Input
              type="number"
              value={minutes}
              onChange={e => setMinutes(Number(e.target.value))}
              placeholder="e.g. 30"
            />
          </div>

          <div>
            <Label>Workouts</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {cardioOptions.map(opt => (
                <label key={opt} className="flex items-center space-x-2">
                  <Checkbox
                    checked={checks[opt]}
                    onCheckedChange={val =>
                      setChecks(prev => ({ ...prev, [opt]: !!val }))
                    }
                  />
                  <Image
                    src={getExerciseImage(opt)}
                    alt={opt}
                    width={36}
                    height={36}
                    className="rounded-md flex-shrink-0"
                  />
                  <span>{opt}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setInfoExercise(opt);
                    }}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    aria-label={`How to do ${opt}`}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => onEnd({ minutes, activities: checks })} disabled={!sessionSuccess}>
              Finish Cardio
            </Button>
          </div>
        </CardContent>
      </Card>
      <ExerciseInfoModal exerciseName={infoExercise} onClose={() => setInfoExercise(null)} />
    </div>
  );
}
