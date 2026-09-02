'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'motion/react';
import { Flame, Utensils, Timer, Footprints, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';
import { formatCalories } from '@/lib/format';
import { cn } from '@/lib/utils';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: 'var(--chart-1)', icon: Flame, label: 'Burn', unit: 'kcal' },
  { key: 'eat' as const, goalType: 'calories_intake', color: 'var(--chart-2)', icon: Utensils, label: 'Eat', unit: 'kcal' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: 'var(--chart-3)', icon: Timer, label: 'Move', unit: 'min' },
  { key: 'steps' as const, goalType: 'daily_steps', color: 'var(--chart-4)', icon: Footprints, label: 'Steps', unit: 'steps' },
];

const RING_SIZE = 220;
const STROKE_WIDTH = 14;
const RING_GAP = 4;

type DailyRingsWidgetProps = {
  profileId: string;
  refreshKey: number;
};

export function DailyRingsWidget({ profileId, refreshKey }: DailyRingsWidgetProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ burn: 0, eat: 0, workoutMinutes: 0, steps: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getTodayRange();

      const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
        supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profileId),
        supabase
          .from('calorie_burns')
          .select('caloriesBurned, duration')
          .eq('profileId', profileId)
          .gte('date', start)
          .lt('date', end),
        supabase.from('food_intakes').select('calories').eq('profileId', profileId).gte('date', start).lt('date', end),
        supabase.from('step_entries').select('steps').eq('profileId', profileId).gte('date', start).lt('date', end),
      ]);

      setGoals((goalsRes.data as Goal[]) || []);

      const burnRows = (burnRes.data as { caloriesBurned: number; duration: number }[]) || [];
      const eatRows = (eatRes.data as { calories: number }[]) || [];
      const stepRows = (stepsRes.data as { steps: number }[]) || [];

      setMetrics({
        burn: burnRows.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0),
        eat: eatRows.reduce((sum, r) => sum + (r.calories || 0), 0),
        workoutMinutes: burnRows.reduce((sum, r) => sum + (r.duration || 0), 0),
        steps: stepRows.reduce((sum, r) => sum + (r.steps || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching daily rings data:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <Skeleton className="h-48 w-48 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const values: Record<string, number> = {
    burn: metrics.burn,
    eat: metrics.eat,
    workoutMinutes: metrics.workoutMinutes,
    steps: metrics.steps,
  };

  const rows = RINGS.map((ring, index) => {
    const target = resolveTarget(goals, ring.goalType);
    const value = values[ring.key];
    const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const current = Math.round(value);
    const radius = (RING_SIZE - STROKE_WIDTH) / 2 - index * (STROKE_WIDTH + RING_GAP);
    const circumference = radius * 2 * Math.PI;
    const arcLength = (pct / 100) * circumference;
    return { ring, target, current, pct, radius, circumference, arcLength };
  });

  const dayScore = Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4">
          <span className="text-sm font-semibold">Today&apos;s Activity</span>

          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg
              className="-rotate-90 transform"
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            >
              <title>Today&apos;s activity rings</title>
              {rows.map(({ ring, radius, circumference, arcLength }, index) => (
                <g key={ring.key}>
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={STROKE_WIDTH}
                    className="text-zinc-200/50 dark:text-zinc-800/50"
                  />
                  <motion.circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={radius}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="round"
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                  />
                </g>
              ))}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn('text-xl font-bold tabular-nums', dayScore >= 100 ? 'text-success' : 'text-foreground')}>
                {dayScore}%
              </span>
              <span className="text-[10px] text-muted-foreground">today</span>
            </div>
          </div>

          <ul className="w-full space-y-1.5">
            {rows.map(({ ring, target, current }) => (
              <li key={ring.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ring.color }} />
                  <span className="truncate">{ring.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  {ring.unit === 'kcal' ? (
                    <>
                      <span className="font-medium tabular-nums">{formatCalories(current)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums"> / {formatCalories(target)}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium tabular-nums">{current.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground tabular-nums"> / {target.toLocaleString()} {ring.unit}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
