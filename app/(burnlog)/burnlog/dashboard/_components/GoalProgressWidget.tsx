'use client';

import { Target } from 'lucide-react';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { NeonGradientCard } from '@/components/ui/neon-gradient-card';
import { Skeleton } from '@/components/ui/skeleton';

type Goal = {
  id: string;
  goalType: string;
  targetValue: number;
  currentValue?: number;
  unit: string;
};

type GoalProgressWidgetProps = {
  goal?: Goal;
  loading?: boolean;
};

// burnlog fire-themed neon
const NEON = { firstColor: '#FF9E4F', secondColor: '#FF3D71' };

export function GoalProgressWidget({
  goal = {
    id: '1',
    goalType: 'weight_loss',
    targetValue: 70,
    currentValue: 75,
    unit: 'kg',
  },
  loading = false,
}: GoalProgressWidgetProps) {
  if (loading) {
    return (
      <NeonGradientCard
        className="col-span-4 z-0"
        borderSize={2}
        borderRadius={16}
        neonColors={NEON}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">Goal Progress</span>
          <Target className="w-5 h-5 text-amber-500" />
        </div>
        <div className="mt-4 flex items-center gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </NeonGradientCard>
    );
  }

  if (!goal) {
    return (
      <NeonGradientCard
        className="col-span-4 z-0"
        borderSize={2}
        borderRadius={16}
        neonColors={NEON}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">Goal Progress</span>
          <Target className="w-5 h-5 text-amber-500" />
        </div>
        <div className="mt-4 text-sm text-muted-foreground">Set a goal to track your progress</div>
      </NeonGradientCard>
    );
  }

  // Format the goal type for display
  const formattedGoalType = goal.goalType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Calculate progress percentage
  const calculateProgress = () => {
    if (goal.currentValue === undefined) return 0;

    // For weight loss goals, progress is inverse (lower is better)
    if (goal.goalType === 'weight_loss') {
      if (goal.currentValue >= 100) return 0;
      if (goal.currentValue <= goal.targetValue) return 100;
      const totalToLose = 100 - goal.targetValue;
      const lostSoFar = 100 - goal.currentValue;
      return Math.round((lostSoFar / totalToLose) * 100);
    }

    // For other goals where higher is better (e.g., strength goals)
    const percentage = Math.round((goal.currentValue / goal.targetValue) * 100);
    return Math.min(percentage, 100);
  };

  const progress = calculateProgress();

  return (
    <NeonGradientCard
      className="col-span-4 z-0"
      borderSize={2}
      borderRadius={16}
      neonColors={NEON}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{formattedGoalType}</span>
        <Target className="w-5 h-5 text-amber-500" />
      </div>

      <div className="mt-4 flex items-center gap-5">
        <AnimatedCircularProgressBar
          value={progress}
          min={0}
          max={100}
          gaugePrimaryColor="#FF9E4F"
          gaugeSecondaryColor="rgba(255, 158, 79, 0.15)"
          className="size-24 text-xl"
        />

        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current</span>
            <span className="font-medium">
              {goal.currentValue} {goal.unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Target</span>
            <span className="font-medium">
              {goal.targetValue} {goal.unit}
            </span>
          </div>
          <div className="pt-1 text-xs text-muted-foreground">
            {progress}% complete
          </div>
        </div>
      </div>
    </NeonGradientCard>
  );
}
