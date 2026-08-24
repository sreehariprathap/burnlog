// app/(burnlog)/meal-planner/_components/HouseholdStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { MealPlannerWizardAnswers } from '@/lib/ai/types';

type HouseholdStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'householdSize' | 'cookMode'>) => void;
};

export function HouseholdStep({ initialAnswers, onContinue }: HouseholdStepProps) {
  const [householdSize, setHouseholdSize] = useState(initialAnswers?.householdSize ?? 1);
  const [cookMode, setCookMode] = useState<MealPlannerWizardAnswers['cookMode']>(
    initialAnswers?.cookMode ?? 'fresh_daily'
  );

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>👥 Who are you cooking for?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Number of people</Label>
          <Input
            type="number"
            min={1}
            value={householdSize}
            onChange={(e) => setHouseholdSize(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <div className="space-y-2">
          <Label>How do you want to cook this week?</Label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setCookMode('weekly_batch')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                cookMode === 'weekly_batch' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              🍲 Batch cook once, eat all week
            </button>
            <button
              type="button"
              onClick={() => setCookMode('fresh_daily')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                cookMode === 'fresh_daily' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              🔥 Cook fresh at each meal
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ householdSize, cookMode })}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
