// app/(burnlog)/meal-planner/_components/MealSelectionStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sunrise, Moon, Apple, HelpCircle } from 'lucide-react';
import type { MealCandidate, MealPlannerWizardAnswers } from '@/lib/ai/types';
import { formatCalories } from '@/lib/format';

const MEAL_LABEL: Record<string, string | React.ReactNode> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const MEAL_ICON: Record<string, React.ReactNode> = {
  breakfast: <Sunrise className="w-4 h-4" />,
  lunch: null,
  dinner: <Moon className="w-4 h-4" />,
  snack: <Apple className="w-4 h-4" />,
};

type MealSelectionStepProps = {
  candidates: MealCandidate[];
  cookMode: MealPlannerWizardAnswers['cookMode'];
  mealsPerDay: number;
  onContinue: (selected: MealCandidate[]) => void;
};

export function MealSelectionStep({ candidates, cookMode, mealsPerDay, onContinue }: MealSelectionStepProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const suggestedCount = cookMode === 'weekly_batch' ? Math.min(4, candidates.length) : Math.min(7, candidates.length);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const selected = candidates.filter((c) => selectedIds.includes(c.id));

  return (
    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>✨ Pick your meals</CardTitle>
        <p className="text-sm text-muted-foreground">
          Selected: {selectedIds.length} · Suggested for your week: ~{suggestedCount} ({mealsPerDay} meals/day)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidates.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <HelpCircle className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">No meal ideas generated</p>
            <p className="text-xs text-muted-foreground">Go back and adjust your preferences, then try again.</p>
          </div>
        )}
        {candidates.map((c) => {
          const isSelected = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${
                isSelected ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  {MEAL_ICON[c.mealType]}
                  {MEAL_LABEL[c.mealType] ?? c.mealType}
                </span>
                <span className="text-[10px] text-muted-foreground">{c.prepMinutes} min</span>
              </div>
              <p className="font-medium text-sm mt-1">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.description}</p>
              <div className="flex gap-3 text-[10px] mt-1">
                <span className="text-primary font-medium">{formatCalories(c.calories)}</span>
                <span className="text-info">P: {c.protein}g</span>
                <span className="text-success">C: {c.carbs}g</span>
                <span className="text-destructive">F: {c.fat}g</span>
              </div>
            </button>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue(selected)} disabled={selected.length === 0}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
