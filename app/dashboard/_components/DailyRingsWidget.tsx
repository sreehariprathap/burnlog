'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';
import AppleActivityCard, { type ActivityData } from '@/components/kokonutui/apple-activity-card';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: '#F97316', colorEnd: '#FDBA74', size: 200, label: 'BURN', unit: 'KCAL' },
  { key: 'eat' as const, goalType: 'calories_intake', color: '#22C55E', colorEnd: '#86EFAC', size: 165, label: 'EAT', unit: 'KCAL' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: '#3B82F6', colorEnd: '#93C5FD', size: 130, label: 'MOVE', unit: 'MIN' },
  { key: 'steps' as const, goalType: 'daily_steps', color: '#A855F7', colorEnd: '#D8B4FE', size: 95, label: 'STEPS', unit: '' },
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

  const activities: ActivityData[] = RINGS.map((ring) => {
    const target = resolveTarget(goals, ring.goalType);
    const value = values[ring.key];
    const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    return {
      label: ring.label,
      value: pct,
      color: ring.color,
      colorEnd: ring.colorEnd,
      size: ring.size,
      current: Math.round(value),
      target,
      unit: ring.unit,
    };
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <AppleActivityCard
          title="Today's Activity"
          activities={activities}
          className="p-0"
        />
      </CardContent>
    </Card>
  );
}
