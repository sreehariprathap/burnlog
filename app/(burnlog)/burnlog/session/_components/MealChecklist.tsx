// app/(burnlog)/session/_components/MealChecklist.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, UtensilsCrossed, Sparkles, Clock, Sunrise, Sun, Moon, Apple } from 'lucide-react';
import { AiLoading } from '@/components/kokonutui/ai-loading';
import { toLocalDateString } from '@/lib/date';
import { formatCalories } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';

type MealEntry = {
  id: string;
  mealType: string;
  name: string;
  description: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  prepMinutes: number | null;
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
const MEAL_ICON: Record<string, typeof Sunrise> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Apple,
};

type MealChecklistProps = {
  profileId: string;
  dayOfWeek: number;
  selectedDate: Date;
};

export function MealChecklist({ profileId, dayOfWeek, selectedDate }: MealChecklistProps) {
  const supabase = createClient();
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [checkedIn, setCheckedIn] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meal_plan_entries')
      .select('*')
      .eq('profileId', profileId)
      .eq('dayOfWeek', dayOfWeek);
    const sorted = ((data as MealEntry[]) || []).sort(
      (a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)
    );
    setEntries(sorted);
    setLoading(false);
  }, [supabase, profileId, dayOfWeek]);

  const fetchCheckIns = useCallback(async () => {
    const { data } = await supabase
      .from('meal_plan_checkins')
      .select('mealType, eaten')
      .eq('profileId', profileId)
      .eq('date', toLocalDateString(selectedDate));
    const map: Record<string, boolean> = {};
    for (const row of (data as { mealType: string; eaten: boolean }[]) || []) {
      map[row.mealType] = row.eaten;
    }
    setCheckedIn(map);
  }, [supabase, profileId, selectedDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchCheckIns();
  }, [fetchCheckIns]);

  async function handleToggle(mealType: string, next: boolean) {
    setCheckedIn((prev) => ({ ...prev, [mealType]: next }));
    const dateKey = toLocalDateString(selectedDate);
    if (next) {
      const { error: upsertError } = await supabase
        .from('meal_plan_checkins')
        .upsert(
          { profileId, date: dateKey, mealType, eaten: true },
          { onConflict: 'profileId,date,mealType' }
        );
      if (upsertError) {
        console.error('Check-in save failed:', upsertError);
        setCheckedIn((prev) => ({ ...prev, [mealType]: false }));
        setError('Failed to save. Please try again.');
        toast({ title: 'Failed to save', description: upsertError.message, variant: 'destructive' });
      }
    } else {
      const { error: deleteError } = await supabase
        .from('meal_plan_checkins')
        .delete()
        .eq('profileId', profileId)
        .eq('date', dateKey)
        .eq('mealType', mealType);
      if (deleteError) {
        console.error('Check-in remove failed:', deleteError);
        setCheckedIn((prev) => ({ ...prev, [mealType]: true }));
        setError('Failed to save. Please try again.');
        toast({ title: 'Failed to save', description: deleteError.message, variant: 'destructive' });
      }
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/meal-plan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        const message = data.error ?? 'Failed to generate meal plan. Please try again.';
        setError(message);
        toast({ title: 'Meal plan generation failed', description: message, variant: 'destructive' });
        return;
      }
      await fetchEntries();
      toast({ title: 'Meal plan ready', description: 'Your 7-day meal plan has been generated.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setError(message);
      toast({ title: 'Meal plan generation failed', description: message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (generating) {
    return (
      <Card>
        <CardContent className="py-4">
          <AiLoading tasks={["Reviewing your goals", "Planning your meals", "Balancing macros", "Building your grocery list"]} />
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Meals
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            AI-powered 7-day meal plan tailored to your goals and preferences.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              {error}
            </div>
          )}
          <Button onClick={handleGenerate} className="w-full gap-2" size="lg">
            <Sparkles className="h-4 w-4" />
            Generate My Meal Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Meals
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleGenerate} title="Regenerate">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
            {error}
          </div>
        )}
        {entries.map((meal) => (
          <div key={meal.id} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
            <Checkbox
              checked={!!checkedIn[meal.mealType]}
              onCheckedChange={(checked) => handleToggle(meal.mealType, checked === true)}
              className="mt-1"
              aria-label={`Mark ${meal.mealType} eaten`}
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {(() => {
                    const MealIcon = MEAL_ICON[meal.mealType];
                    return MealIcon ? <MealIcon className="h-3 w-3" /> : null;
                  })()}
                  {MEAL_LABEL[meal.mealType] ?? meal.mealType}
                </span>
                {meal.prepMinutes ? (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {meal.prepMinutes} min
                  </span>
                ) : null}
              </div>
              <p className="font-medium text-sm">{meal.name}</p>
              {meal.description && (
                <p className="text-xs text-muted-foreground">{meal.description}</p>
              )}
              {(meal.calories || meal.protein || meal.carbs || meal.fat) && (
                <div className="flex gap-3 text-[10px] mt-1">
                  {meal.calories ? <span className="text-orange-500 font-medium">{formatCalories(meal.calories)}</span> : null}
                  {meal.protein ? <span className="text-blue-500">P: {meal.protein}g</span> : null}
                  {meal.carbs ? <span className="text-green-500">C: {meal.carbs}g</span> : null}
                  {meal.fat ? <span className="text-red-500">F: {meal.fat}g</span> : null}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
