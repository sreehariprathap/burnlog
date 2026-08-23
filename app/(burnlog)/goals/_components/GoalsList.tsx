'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Goal } from '../page';

type GoalsListProps = {
  goals: Goal[];
};

export function GoalsList({ goals }: GoalsListProps) {
  // Helper function to format the goal type for display
  const formatGoalType = (type: string): string => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Group goals by type
  const groupedGoals = goals.reduce((acc, goal) => {
    const { goalType } = goal;
    if (!acc[goalType]) {
      acc[goalType] = [];
    }
    acc[goalType].push(goal);
    return acc;
  }, {} as Record<string, Goal[]>);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Your Goals</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(groupedGoals).map(([type, typeGoals]) => (
            <div key={type} className="mb-4">
              <h3 className="text-lg font-medium mb-2">{formatGoalType(type)}</h3>
              <ul className="space-y-2">
                {typeGoals.map(goal => (
                  <li key={goal.id} className="flex items-center justify-between border-b pb-2">
                    <span>{formatGoalType(goal.goalType)}</span>
                    <span className="font-bold">{goal.targetValue} 
                      {goal.goalType.includes('weight') && ' kg'}
                      {goal.goalType.includes('calories') && ' kcal'}
                      {goal.goalType.includes('distance') && ' km'}
                      {goal.goalType.includes('time') && ' mins'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}