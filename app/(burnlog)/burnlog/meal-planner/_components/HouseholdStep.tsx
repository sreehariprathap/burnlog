// app/(burnlog)/meal-planner/_components/HouseholdStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Users, UtensilsCrossed, Flame } from 'lucide-react';
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
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Who are you cooking for?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="household-size">Number of people</Label>
          <Input
            id="household-size"
            type="number"
            inputMode="numeric"
            min={1}
            value={householdSize}
            onChange={(e) => setHouseholdSize(Math.max(1, Number(e.target.value) || 1))}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>How do you want to cook this week?</Label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setCookMode('weekly_batch')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-2 ${
                cookMode === 'weekly_batch' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 flex-shrink-0" />Batch cook once, eat all week
            </button>
            <button
              type="button"
              onClick={() => setCookMode('fresh_daily')}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-2 ${
                cookMode === 'fresh_daily' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <Flame className="w-4 h-4 flex-shrink-0" />Cook fresh at each meal
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
