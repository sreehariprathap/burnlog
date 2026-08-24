// app/(burnlog)/meal-planner/_components/AppliancesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { KITCHEN_APPLIANCES, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type AppliancesStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'appliances'>) => void;
};

export function AppliancesStep({ initialAnswers, onContinue }: AppliancesStepProps) {
  const [cookingAtHome, setCookingAtHome] = useState((initialAnswers?.appliances?.length ?? 0) > 0 || initialAnswers?.appliances === undefined);
  const [appliances, setAppliances] = useState<string[]>(initialAnswers?.appliances ?? []);

  const toggle = (value: string) => {
    setAppliances((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🍳 Cooking at home?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setCookingAtHome(true)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            Yes, I&apos;m cooking at home
          </button>
          <button
            type="button"
            onClick={() => setCookingAtHome(false)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              !cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            No, keep it no-cook / ready-to-eat
          </button>
        </div>

        {cookingAtHome && (
          <div className="space-y-2">
            <Label>What do you have available?</Label>
            <div className="grid grid-cols-2 gap-2">
              {KITCHEN_APPLIANCES.map((a) => (
                <label key={a} className="flex items-center space-x-2">
                  <Checkbox checked={appliances.includes(a)} onCheckedChange={() => toggle(a)} />
                  <span className="text-sm">{a}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ appliances: cookingAtHome ? appliances : [] })}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
