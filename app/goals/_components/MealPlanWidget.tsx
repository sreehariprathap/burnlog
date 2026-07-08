'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';

type Meal = {
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepMinutes: number;
};

type DayPlan = {
  day: string;
  meals: {
    breakfast: Meal;
    lunch: Meal;
    dinner: Meal;
    snack?: Meal;
  };
  totalCalories: number;
};

type GroceryList = Record<string, string[]>;

type MealPlanResult = {
  weekPlan: DayPlan[];
  groceryList: GroceryList;
  estimatedWeeklyBudget: string;
  nutritionSummary: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  'Produce': '🥦',
  'Protein': '🥩',
  'Dairy / Alternatives': '🥛',
  'Grains & Carbs': '🌾',
  'Pantry & Spices': '🫙',
  'Frozen': '🧊',
};

const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

export function MealPlanWidget() {
  const [plan, setPlan] = useState<MealPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [showGrocery, setShowGrocery] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/meal-plan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to generate meal plan. Please try again.');
        return;
      }
      setPlan(data as MealPlanResult);
      setActiveDay(0);
      setShowGrocery(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!plan && !loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🗓️ Plan My Week</CardTitle>
          <p className="text-sm text-muted-foreground">
            AI-powered 7-day meal plan + grocery list tailored to your goals and preferences.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              {error}
            </div>
          )}
          <Button onClick={generate} className="w-full" size="lg">
            ✨ Generate My Meal Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Crafting your personalised 7-day meal plan…<br />
            <span className="text-xs">This takes about 20 seconds</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!plan) return null;

  const day = plan.weekPlan[activeDay];

  const mealEntries = Object.entries(day.meals) as [string, Meal][];

  const MEAL_LABEL: Record<string, string> = {
    breakfast: '🌅 Breakfast',
    lunch: '☀️ Lunch',
    dinner: '🌙 Dinner',
    snack: '🍎 Snack',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>🗓️ This Week&apos;s Meal Plan</CardTitle>
            {plan.nutritionSummary && (
              <p className="text-xs text-muted-foreground mt-1">{plan.nutritionSummary}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={generate}
            disabled={loading}
            title="Regenerate"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
          {plan.weekPlan.map((d, i) => (
            <button
              key={d.day}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeDay === i
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {DAY_ABBR[d.day] ?? d.day}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Day header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{day.day}</h3>
          <span className="text-sm text-muted-foreground">{day.totalCalories} kcal</span>
        </div>

        {/* Meals */}
        <div className="space-y-3">
          {mealEntries.map(([key, meal]) => (
            <div key={key} className="rounded-xl bg-muted/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {MEAL_LABEL[key] ?? key}
                </span>
                {meal.prepMinutes > 0 && (
                  <span className="text-[10px] text-muted-foreground">⏱ {meal.prepMinutes} min</span>
                )}
              </div>
              <p className="font-medium text-sm">{meal.name}</p>
              {meal.description && (
                <p className="text-xs text-muted-foreground">{meal.description}</p>
              )}
              <div className="flex gap-3 text-[10px] mt-1">
                <span className="text-orange-500 font-medium">{meal.calories} kcal</span>
                <span className="text-blue-500">P: {meal.protein}g</span>
                <span className="text-green-500">C: {meal.carbs}g</span>
                <span className="text-red-500">F: {meal.fat}g</span>
              </div>
            </div>
          ))}
        </div>

        {/* Grocery list toggle */}
        <button
          type="button"
          onClick={() => setShowGrocery((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Grocery List
            {plan.estimatedWeeklyBudget && (
              <span className="text-xs text-muted-foreground font-normal">
                est. {plan.estimatedWeeklyBudget}/week
              </span>
            )}
          </span>
          {showGrocery ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showGrocery && (
          <div className="space-y-3">
            {Object.entries(plan.groceryList).map(([category, items]) => (
              items.length > 0 && (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {CATEGORY_ICONS[category] ?? '📦'} {category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item: string) => (
                      <span
                        key={item}
                        className="text-xs bg-muted px-2 py-1 rounded-full border"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
