'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Utensils } from 'lucide-react';

type MealPrepBannerProps = {
  mealPrepDayOfWeek: number | null;
  lastMealPlanGeneratedAt: string | null;
};

function startOfThisWeek(): Date {
  const now = new Date();
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  result.setDate(result.getDate() - result.getDay()); // back to Sunday
  return result;
}

export function MealPrepBanner({ mealPrepDayOfWeek, lastMealPlanGeneratedAt }: MealPrepBannerProps) {
  if (mealPrepDayOfWeek === null) return null;

  const today = new Date();
  if (today.getDay() !== mealPrepDayOfWeek) return null;

  const generatedAt = lastMealPlanGeneratedAt ? new Date(lastMealPlanGeneratedAt) : null;
  const alreadyPlannedThisWeek = generatedAt !== null && generatedAt >= startOfThisWeek();
  if (alreadyPlannedThisWeek) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="py-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2"><Utensils className="w-4 h-4" />Time to plan this week&apos;s meals</p>
          <p className="text-xs text-muted-foreground">Today&apos;s your meal-prep day.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/burnlog/meal-planner">Plan now</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
