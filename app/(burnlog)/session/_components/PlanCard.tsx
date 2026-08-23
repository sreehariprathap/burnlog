'use client';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Repeat } from 'lucide-react';

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {plan ? `${plan.bodyPart} Day` : 'No Workout Scheduled'}
          {plan?.repeatWeekly && <Repeat className="h-4 w-4 text-muted-foreground" />}
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
