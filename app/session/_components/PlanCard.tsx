'use client';
import React from 'react';
import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getWorkoutVisual } from '@/lib/workoutVisuals';

export type PlanDay = {
  dayIndex: number;
  bodyPart: string;
  repeatWeekly?: boolean;
};

type PlanCardProps = {
  plan: PlanDay | null;
  onStart: () => void;
  onAdd: () => void;
};

export function PlanCard({ plan, onStart, onAdd }: PlanCardProps) {
  const visual = plan ? getWorkoutVisual(plan.bodyPart) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {visual && (
            <Image
              src={visual.src}
              alt={visual.alt}
              width={28}
              height={28}
              className="workout-visual-active"
            />
          )}
          {plan
            ? `${plan.bodyPart} Day${plan.repeatWeekly ? ' 🔁' : ''}`
            : 'No Workout Scheduled'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center">
        {plan ? (
          <Button onClick={onStart}>Start Session</Button>
        ) : (
          <Button variant="outline" onClick={onAdd}>
            + Add Workout
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
