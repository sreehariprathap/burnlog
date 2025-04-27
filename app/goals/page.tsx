'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import WeightTracker from './_components/WeightTracker';
import MuscleTracker from './_components/MuscleTracker';
import ToneTracker from './_components/ToneTracker';
import { NewGoalModal } from './_components/NewGoalModal';

const GoalOptions: Record<string, string> = {
  WEIGHT_LOSS: 'Lose Weight (kg)',
  MUSCLE_GAIN: 'Gain Muscle (kg)',
  TONE: 'Tone Body',
  // …other goals if you add them later
};

type Goal = {
  id: string;
  goalType: keyof typeof GoalOptions;
  targetValue: number;
};

export default function GoalsPage() {
  const supabase = createClientComponentClient();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // form state for "no goals yet"
  const [newGoalType, setNewGoalType] = useState<keyof typeof GoalOptions>('WEIGHT_LOSS');
  const [targetValue, setTargetValue] = useState<string>('');

  // fetch & refresh goals
  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError(null);

    // get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || 'User not found');
      setGoals([]);
      setLoading(false);
      return;
    }

    // load this user's goals
    const { data, error: goalsError } = await supabase
      .from('FitnessGoal')
      .select('*')
      .eq('profileId', user.id);

    if (goalsError) {
      setError(goalsError.message);
      setGoals([]);
    } else {
      setGoals(data as Goal[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // handler for initial form
  const handleAddGoal = async () => {
    setError(null);
    if (!targetValue) {
      setError('Please enter a target value');
      return;
    }
    setLoading(true);

    // re-check user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || 'User not found');
      setLoading(false);
      return;
    }

    // insert new goal
    const { error: insertError } = await supabase
      .from('FitnessGoal')
      .insert({
        profileId: user.id,
        goalType: newGoalType,
        targetValue: parseFloat(targetValue)
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setTargetValue('');
      fetchGoals();
    }

    setLoading(false);
  };

  return (
    <div className="pb-16">
      <TopBar title="Fitness Goals" />
      <main className="p-4 mt-4 space-y-6">
        {loading ? (
          <p>Loading…</p>
        ) : goals.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Set Your First Fitness Goal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="goalType">Goal Type</Label>
                <Select
                  value={newGoalType}
                  onValueChange={(val) => setNewGoalType(val as keyof typeof GoalOptions)}
                >
                  <SelectTrigger id="goalType" className="w-full">
                    <SelectValue placeholder="Select a goal type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GoalOptions).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="targetValue">Target Value</Label>
                <Input
                  id="targetValue"
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <Button onClick={handleAddGoal} disabled={loading}>
                {loading ? 'Adding…' : 'Add Goal'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Your Fitness Goals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {goals.map((g) => (
                  <div key={g.id} className="flex flex-col gap-4">
                    <div className="flex flex-col justify-between items-center">
                      <div>
                        <span className="font-medium">{GoalOptions[g.goalType]}</span>
                        <span className="ml-2 text-sm text-gray-500">{g.targetValue}</span>
                      </div>
                      {/* custom action for first three goal types */}
                      {g.goalType === 'WEIGHT_LOSS' && <WeightTracker />}
                      {g.goalType === 'MUSCLE_GAIN' && <MuscleTracker />}
                      {g.goalType === 'TONE' && <ToneTracker />}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* floating + button / modal to add more goals */}
            <NewGoalModal onAdded={fetchGoals} />
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
