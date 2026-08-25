// app/(burnlog)/meal-planner/_components/WeekGridStep.tsx
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MealCandidate, MealGridCell, MealType } from '@/lib/ai/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MEAL_TYPES_BY_COUNT: Record<number, MealType[]> = {
  1: ['lunch'],
  2: ['lunch', 'dinner'],
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'dinner', 'snack'],
};

function buildInitialGrid(selected: MealCandidate[], mealsPerDay: number): MealGridCell[] {
  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];
  const cells: MealGridCell[] = [];
  let i = 0;
  for (let day = 0; day < 7; day++) {
    for (const mealType of mealTypes) {
      cells.push({ dayOfWeek: day, mealType, meal: selected.length ? selected[i % selected.length] : null });
      i++;
    }
  }
  return cells;
}

function cellKey(dayOfWeek: number, mealType: string): string {
  return `${dayOfWeek}-${mealType}`;
}

type WeekGridStepProps = {
  selected: MealCandidate[];
  mealsPerDay: number;
  onConfirm: (grid: MealGridCell[]) => void;
};

export function WeekGridStep({ selected, mealsPerDay, onConfirm }: WeekGridStepProps) {
  const initialGrid = useMemo(() => buildInitialGrid(selected, mealsPerDay), [selected, mealsPerDay]);
  const [grid, setGrid] = useState<MealGridCell[]>(initialGrid);
  const [swapSource, setSwapSource] = useState<string | null>(null);

  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];

  const handleTap = (dayOfWeek: number, mealType: string) => {
    const key = cellKey(dayOfWeek, mealType);
    if (swapSource === null) {
      setSwapSource(key);
      return;
    }
    if (swapSource === key) {
      setSwapSource(null);
      return;
    }
    setGrid((prev) => {
      const next = [...prev];
      const aIdx = next.findIndex((c) => cellKey(c.dayOfWeek, c.mealType) === swapSource);
      const bIdx = next.findIndex((c) => cellKey(c.dayOfWeek, c.mealType) === key);
      const aMeal = next[aIdx].meal;
      next[aIdx] = { ...next[aIdx], meal: next[bIdx].meal };
      next[bIdx] = { ...next[bIdx], meal: aMeal };
      return next;
    });
    setSwapSource(null);
  };

  return (
    <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>📅 Arrange your week</CardTitle>
        <p className="text-sm text-muted-foreground">Tap a meal, then tap another to swap them.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 text-xs">
          {DAY_LABELS.map((label) => (
            <div key={label} className="text-center font-semibold text-muted-foreground">{label}</div>
          ))}
          {mealTypes.map((mealType) => (
            <div key={mealType} className="contents">
              {DAY_LABELS.map((_, dayOfWeek) => {
                const cell = grid.find((c) => c.dayOfWeek === dayOfWeek && c.mealType === mealType);
                const key = cellKey(dayOfWeek, mealType);
                const isSelected = swapSource === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTap(dayOfWeek, mealType)}
                    className={`rounded-lg border p-2 h-20 text-left overflow-hidden transition-colors ${
                      isSelected ? 'bg-primary/20 border-primary' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-muted-foreground">{mealType}</div>
                    <div className="text-[11px] font-medium line-clamp-3">{cell?.meal?.name ?? '—'}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={() => onConfirm(grid)}>Confirm week →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
