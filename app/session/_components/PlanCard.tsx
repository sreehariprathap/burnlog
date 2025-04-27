'use client';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type PlanDay = {
  dayIndex: number;
  bodyPart: string;
};

type PlanCardProps = {
  plan: PlanDay | null;
  onStart: () => void;
  onAdd: () => void;
};

export function PlanCard({ plan, onStart, onAdd }: PlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {plan ? `${plan.bodyPart} Day` : 'No Workout Scheduled'}
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
