'use client';

import { Target } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
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
      <StatCard className="col-span-4" title="Goal Progress" icon={Target}>
        <div className="flex items-center gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </StatCard>
    );
  }

  if (!goal) {
    return (
      <StatCard className="col-span-4" title="Goal Progress" icon={Target}>
        <div className="text-sm text-muted-foreground">Set a goal to track your progress</div>
      </StatCard>
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
    <StatCard className="col-span-4" title={formattedGoalType} icon={Target}>
      <div className="flex items-center gap-5">
        <StatRing value={progress} size="md" />
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
          <div className="pt-1 text-xs text-muted-foreground">{progress}% complete</div>
        </div>
      </div>
    </StatCard>
  );
}
