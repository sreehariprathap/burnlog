'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: '#F97316', radius: 88, label: 'Calories Burned', unit: 'kcal' },
  { key: 'eat' as const, goalType: 'calories_intake', color: '#22C55E', radius: 72, label: 'Calories Eaten', unit: 'kcal' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: '#3B82F6', radius: 56, label: 'Workout Minutes', unit: 'min' },
  { key: 'steps' as const, goalType: 'daily_steps', color: '#A855F7', radius: 40, label: 'Steps', unit: 'steps' },
];

type DailyRingsWidgetProps = {
  profileId: string;
  refreshKey: number;
};

export function DailyRingsWidget({ profileId, refreshKey }: DailyRingsWidgetProps) {
  const supabase = createClientComponentClient();
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

  const size = 200;
  const center = size / 2;

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col items-center gap-4">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {RINGS.map((ring) => {
              const target = resolveTarget(goals, ring.goalType);
              const value = values[ring.key];
              const pct = target > 0 ? Math.min(1, value / target) : 0;
              const circumference = 2 * Math.PI * ring.radius;
              const offset = circumference * (1 - pct);

              return (
                <g key={ring.key}>
                  <circle
                    cx={center}
                    cy={center}
                    r={ring.radius}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeWidth={12}
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={ring.radius}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth={12}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${center} ${center})`}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{metrics.steps.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">steps today</span>
          </div>
        </div>

        <div className="w-full space-y-1">
          {RINGS.map((ring) => {
            const hasGoal = goals.some((g) => g.goalType === ring.goalType);
            const target = resolveTarget(goals, ring.goalType);
            const value = values[ring.key];
            return (
              <div key={ring.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ring.color }} />
                  <span>{ring.label}</span>
                </div>
                <span className="text-muted-foreground">
                  {Math.round(value)} / {target} {ring.unit}
                  {!hasGoal && ' (default)'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
