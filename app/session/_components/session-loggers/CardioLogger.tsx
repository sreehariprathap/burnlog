/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type CardioLoggerProps = { onEnd: () => void };

const cardioOptions = ['Running','Cycling','Rowing','Elliptical','Other'];

export function CardioLogger({ onEnd }: CardioLoggerProps) {
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
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onEnd} disabled={!sessionSuccess}>
              Finish Cardio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
