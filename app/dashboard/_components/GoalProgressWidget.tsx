'use client';

import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    unit: 'kg'
  },
  loading = false
}: GoalProgressWidgetProps) {
  // If no goal or loading, show placeholder
  if (loading || !goal) {
    return (
      <Card className="col-span-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Goal Progress</CardTitle>
            <Target className="w-5 h-5 text-amber-500" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {loading ? "Loading goal data..." : "Set a goal to track your progress"}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format the goal type for display
  const formattedGoalType = goal.goalType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Calculate progress percentage
  const calculateProgress = () => {
    if (goal.currentValue === undefined) return 0;
    
    // For weight loss goals, progress is inverse (lower is better)
    if (goal.goalType === 'weight_loss') {
      // If current weight is above starting point, no progress
      if (goal.currentValue >= 100) return 0;
      
      // If reached target, 100% progress
      if (goal.currentValue <= goal.targetValue) return 100;
      
      // Calculate percentage between starting point and target
      // Assuming 100 is the starting weight for this example
      const totalToLose = 100 - goal.targetValue;
      const lostSoFar = 100 - goal.currentValue;
      return Math.round((lostSoFar / totalToLose) * 100);
    }
    
    // For other goals where higher is better (e.g., strength goals)
    // Assuming 0 as the starting point
    const percentage = Math.round((goal.currentValue / goal.targetValue) * 100);
    return Math.min(percentage, 100); // Cap at 100%
  };
  
  const progress = calculateProgress();
  
  return (
    <Card className="col-span-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>{formattedGoalType}</CardTitle>
          <Target className="w-5 h-5 text-amber-500" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium">
            Current: {goal.currentValue} {goal.unit}
          </div>
          <div className="text-sm font-medium">
            Target: {goal.targetValue} {goal.unit}
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="relative h-2 w-full bg-gray-200 rounded-full mt-1">
          <div
            className="absolute h-full bg-amber-500 rounded-full"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="text-right text-xs mt-1 text-gray-500">{progress}% complete</div>
      </CardContent>
    </Card>
  );
}