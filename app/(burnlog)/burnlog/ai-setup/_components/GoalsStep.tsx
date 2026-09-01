// app/ai-setup/_components/GoalsStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GOAL_TYPES } from '@/lib/goalTypes';

export type GoalEntry = {
  goalType: string;
  targetValue: number;
};

type GoalsStepProps = {
  onContinue: (goals: GoalEntry[]) => void;
  onSkip: () => void;
};

export function GoalsStep({ onContinue, onSkip }: GoalsStepProps) {
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [goalType, setGoalType] = useState<string>(GOAL_TYPES[0].value);
  const [targetValue, setTargetValue] = useState('');

  const handleAdd = () => {
    if (!targetValue || isNaN(Number(targetValue))) return;
    setGoals((prev) => [...prev, { goalType, targetValue: Number(targetValue) }]);
    setTargetValue('');
  };

  const handleRemove = (index: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>What are your goals?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {goals.length > 0 && (
          <ul className="space-y-2">
            {goals.map((g, i) => {
              const label = GOAL_TYPES.find((t) => t.value === g.goalType)?.label ?? g.goalType;
              return (
                <li key={i} className="flex items-center justify-between text-sm border rounded-md p-2">
                  <span>{label}: {g.targetValue}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2">
          <Label htmlFor="goalType">Goal Type</Label>
          <select
            id="goalType"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="targetValue">Target Value</Label>
          <Input
            id="targetValue"
            type="number"
            placeholder="Enter target value"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            min="0"
            step="any"
          />
        </div>

        <Button type="button" variant="outline" onClick={handleAdd}>
          Add Goal
        </Button>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button type="button" onClick={() => onContinue(goals)}>Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
