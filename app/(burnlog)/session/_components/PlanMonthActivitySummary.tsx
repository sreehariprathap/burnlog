// app/session/_components/PlanMonthActivitySummary.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolveTarget } from '@/lib/dailyTargets';
import { cn } from '@/lib/utils';

type PlanMonthActivitySummaryProps = {
  profileId: string;
  displayMonth: Date;
};

type Totals = { burn: number; eat: number; steps: number };

const BARS = [
  { key: 'burn' as const, goalType: 'calories_burned', label: 'Burn', color: 'bg-[color:var(--chart-1)]' },
  { key: 'eat' as const, goalType: 'calories_intake', label: 'Eat', color: 'bg-[color:var(--chart-3)]' },
  { key: 'steps' as const, goalType: 'daily_steps', label: 'Steps', color: 'bg-[color:var(--chart-2)]' },
];

export function PlanMonthActivitySummary({ profileId, displayMonth }: PlanMonthActivitySummaryProps) {
  const supabase = createClient();
  const [totals, setTotals] = useState<Totals>({ burn: 0, eat: 0, steps: 0 });
  const [goals, setGoals] = useState<{ goalType: string; targetValue: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
      const now = new Date();
      const monthEnd = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);
      const rangeEnd = now < monthEnd ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : monthEnd;

      const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
        supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
        supabase
          .from('calorie_burns')
          .select('caloriesBurned')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
        supabase
          .from('food_intakes')
          .select('calories')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
        supabase
          .from('step_entries')
          .select('steps')
          .eq('profileId', profileId)
          .gte('date', monthStart.toISOString())
          .lt('date', rangeEnd.toISOString()),
      ]);

      if (cancelled) return;

      setGoals(goalsRes.data ?? []);
      setTotals({
        burn: (burnRes.data ?? []).reduce((sum, r) => sum + (r.caloriesBurned ?? 0), 0),
        eat: (eatRes.data ?? []).reduce((sum, r) => sum + (r.calories ?? 0), 0),
        steps: (stepsRes.data ?? []).reduce((sum, r) => sum + (r.steps ?? 0), 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, displayMonth]);

  const now = new Date();
  const isDisplayedMonthCurrent =
    now.getFullYear() === displayMonth.getFullYear() && now.getMonth() === displayMonth.getMonth();
  const daysElapsed = isDisplayedMonthCurrent
    ? now.getDate()
    : new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Monthly progress</p>
      {BARS.map((bar) => {
        const target = resolveTarget(goals, bar.goalType) * daysElapsed;
        const value = totals[bar.key];
        const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
        return (
          <div key={bar.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{bar.label}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div className={cn('h-1.5 rounded-full', bar.color)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
