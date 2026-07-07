// app/ai-setup/_components/NutritionStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NutritionAnswers } from '@/lib/ai/types';

type NutritionStepProps = {
  onContinue: (answers: NutritionAnswers) => void;
  onSkip: () => void;
};

export function NutritionStep({ onContinue, onSkip }: NutritionStepProps) {
  const [dietStyle, setDietStyle] = useState<NutritionAnswers['dietStyle']>('none');
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [restrictions, setRestrictions] = useState('');

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Your nutrition habits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Diet style</Label>
          <Select value={dietStyle} onValueChange={(v) => setDietStyle(v as NutritionAnswers['dietStyle'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No restrictions</SelectItem>
              <SelectItem value="vegetarian">Vegetarian</SelectItem>
              <SelectItem value="vegan">Vegan</SelectItem>
              <SelectItem value="keto">Keto</SelectItem>
              <SelectItem value="paleo">Paleo</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Meals per day: {mealsPerDay}</Label>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={mealsPerDay}
            onChange={(e) => setMealsPerDay(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="restrictions">Allergies or restrictions (optional)</Label>
          <textarea
            id="restrictions"
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            className="w-full p-2 border rounded-md h-20"
            placeholder="e.g. lactose intolerant, nut allergy"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button type="button" onClick={() => onContinue({ dietStyle, mealsPerDay, restrictions })}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
