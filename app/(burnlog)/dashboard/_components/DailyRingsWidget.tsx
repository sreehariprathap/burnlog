'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Flame, Utensils, Timer, Footprints } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveTarget, getTodayRange } from '@/lib/dailyTargets';
import { formatCalories } from '@/lib/format';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';

type Goal = { goalType: string; targetValue: number };

type Metrics = {
  burn: number;
  eat: number;
  workoutMinutes: number;
  steps: number;
};

const RINGS = [
  { key: 'burn' as const, goalType: 'calories_burned', color: '#F97316', secondaryColor: 'rgba(249, 115, 22, 0.15)', icon: Flame, label: 'Burn', unit: 'kcal' },
  { key: 'eat' as const, goalType: 'calories_intake', color: '#22C55E', secondaryColor: 'rgba(34, 197, 94, 0.15)', icon: Utensils, label: 'Eat', unit: 'kcal' },
  { key: 'workoutMinutes' as const, goalType: 'workout_time', color: '#3B82F6', secondaryColor: 'rgba(59, 130, 246, 0.15)', icon: Timer, label: 'Move', unit: 'min' },
  { key: 'steps' as const, goalType: 'daily_steps', color: '#A855F7', secondaryColor: 'rgba(168, 85, 247, 0.15)', icon: Footprints, label: 'Steps', unit: 'steps' },
];

const ringTabs: TabItem[] = RINGS.map((ring) => ({
  id: ring.key,
  icon: ring.icon,
  label: ring.label,
  color: ring.color,
}));

type DailyRingsWidgetProps = {
  profileId: string;
  refreshKey: number;
};

export function DailyRingsWidget({ profileId, refreshKey }: DailyRingsWidgetProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ burn: 0, eat: 0, workoutMinutes: 0, steps: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  const slides = RINGS.map((ring) => {
    const target = resolveTarget(goals, ring.goalType);
    const value = values[ring.key];
    const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const current = Math.round(value);

    return (
      <div key={ring.key} className="flex flex-col items-center gap-3 py-2">
        <AnimatedCircularProgressBar
          value={pct}
          min={0}
          max={100}
          gaugePrimaryColor={ring.color}
          gaugeSecondaryColor={ring.secondaryColor}
          className="size-40"
        />
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-sm font-semibold">{ring.label}</span>
          <span className="text-sm">
            {ring.unit === 'kcal' ? (
              <>
                <span className="font-medium tabular-nums">{formatCalories(current)}</span>
                <span className="text-muted-foreground"> / {formatCalories(target)}</span>
              </>
            ) : (
              <>
                <span className="font-medium tabular-nums">{current.toLocaleString()}</span>
                <span className="text-muted-foreground"> / {target.toLocaleString()} {ring.unit}</span>
              </>
            )}
          </span>
        </div>
      </div>
    );
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Today&apos;s Activity</span>
          </div>
          <SmoothTabs items={ringTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
          <MotionCarousel selectedIndex={selectedIndex} onSelect={setSelectedIndex} slides={slides} />
        </div>
      </CardContent>
    </Card>
  );
}
