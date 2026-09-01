// app/(burnlog)/goals/_components/MealPrepStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

type MealPrepStepProps = {
  onContinue: (answers: { dayOfWeek: number; time: string; timezone: string }) => void;
  onSkip: () => void;
};

export function MealPrepStep({ onContinue, onSkip }: MealPrepStepProps) {
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [time, setTime] = useState('10:00');

  const handleContinue = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    onContinue({ dayOfWeek, time, timezone });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🍽️ When do you meal-prep?</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll remind you to plan your meals that day.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Day of the week</Label>
          <div className="grid grid-cols-2 gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDayOfWeek(d.value)}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  dayOfWeek === d.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onSkip} className="flex-1">Skip</Button>
          <Button onClick={handleContinue} className="flex-1">Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
