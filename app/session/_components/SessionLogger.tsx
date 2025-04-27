'use client';
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlanDay } from './PlanCard';

type SetEntry = { exercise: string; sets: number; reps: number; weight: number };

type SessionLoggerProps = {
  plan: PlanDay;
  onEnd: () => void;
};

export function SessionLogger({ plan, onEnd }: SessionLoggerProps) {
  const [entries, setEntries] = useState<SetEntry[]>([]);
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(0);

  const addEntry = () => {
    setEntries(prev => [...prev, { exercise, sets, reps, weight }]);
    setExercise('');
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Logging {plan.bodyPart} Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <Label>Exercise</Label>
              <Input value={exercise} onChange={e => setExercise(e.target.value)} />
            </div>
            <div className="flex space-x-2">
              <div className="flex flex-col gap-1">
                <Label>Sets</Label>
                <Input type="number" value={sets} onChange={e => setSets(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Reps</Label>
                <Input type="number" value={reps} onChange={e => setReps(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Weight</Label>
                <Input type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} />
              </div>
            </div>
            <Button onClick={addEntry}>Add Set</Button>
          </div>

          <div className="space-y-2">
            {entries.map((e, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{e.exercise}</span>
                <span>{e.sets}×{e.reps} @ {e.weight} kg</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={onEnd}>Finish</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
