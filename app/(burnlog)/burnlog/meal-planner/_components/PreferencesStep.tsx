// app/(burnlog)/meal-planner/_components/PreferencesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Utensils, Sparkles, Heart } from 'lucide-react';
import { CUISINE_STYLES, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type PreferencesStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'mealsPerDay' | 'cuisinePreferences' | 'surpriseMe' | 'favoriteMeals'>) => void;
};

export function PreferencesStep({ initialAnswers, onContinue }: PreferencesStepProps) {
  const [mealsPerDay, setMealsPerDay] = useState(initialAnswers?.mealsPerDay ?? 3);
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>(initialAnswers?.cuisinePreferences ?? []);
  const [surpriseMe, setSurpriseMe] = useState(initialAnswers?.surpriseMe ?? false);
  const [favoriteMeals, setFavoriteMeals] = useState(initialAnswers?.favoriteMeals ?? '');

  const toggle = (value: string) => {
    setCuisinePreferences((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Utensils className="w-5 h-5" />What do you feel like eating?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="meals-per-day">Meals per day</Label>
          <Input
            id="meals-per-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={4}
            value={mealsPerDay}
            onChange={(e) => setMealsPerDay(Math.min(4, Math.max(1, Number(e.target.value) || 3)))}
            autoFocus
          />
        </div>

        <label className="flex items-center space-x-3 rounded-xl border p-3">
          <Checkbox checked={surpriseMe} onCheckedChange={(v) => setSurpriseMe(!!v)} />
          <span className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" />Surprise me — no cuisine preference, just pick creatively</span>
        </label>

        {!surpriseMe && (
          <div className="space-y-2">
            <Label>Cuisine styles you like</Label>
            <div className="grid grid-cols-2 gap-2">
              {CUISINE_STYLES.map((c) => (
                <label key={c} className="flex items-center space-x-2">
                  <Checkbox checked={cuisinePreferences.includes(c)} onCheckedChange={() => toggle(c)} />
                  <span className="text-sm">{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="favorite-meals" className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Favorite meals
          </Label>
          <Textarea
            id="favorite-meals"
            value={favoriteMeals}
            onChange={(e) => setFavoriteMeals(e.target.value)}
            placeholder="e.g. butter chicken, caesar salad, avocado toast — dishes you'd like worked in"
            rows={2}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={() =>
              onContinue({
                mealsPerDay,
                cuisinePreferences: surpriseMe ? [] : cuisinePreferences,
                surpriseMe,
                favoriteMeals: favoriteMeals.trim(),
              })
            }
          >
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
