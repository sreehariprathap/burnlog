'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Goal } from '../page';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader } from 'lucide-react';

type AddGoalFormProps = {
  onGoalAdded: (goal: Goal) => void;
  userId: string;
};

const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' }
];

export function AddGoalForm({ onGoalAdded, userId }: AddGoalFormProps) {
  const [goalType, setGoalType] = useState('weight_loss');
  const [targetValue, setTargetValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClientComponentClient();
  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!targetValue || isNaN(Number(targetValue))) {
        throw new Error('Please enter a valid number');
      }

      // First get the profile ID
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('userId', userId)
        .single();

      if (!profileData) {
        throw new Error('Profile not found');
      }

      // Insert the new goal
      const { data, error } = await supabase
        .from('fitness_goals')
        .insert([
          {
            profileId: profileData.id,
            goalType,
            targetValue: Number(targetValue),
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        // Notify parent component
        onGoalAdded(data[0] as Goal);
        
        // Reset form
        setGoalType('weight_loss');
        setTargetValue('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error adding goal:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="goalType">Goal Type</Label>
        <select
          id="goalType"
          value={goalType}
          onChange={(e) => setGoalType(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
        >
          {GOAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
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
          required
          min="0"
          step="any"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? <Loader className='animate-spin'/>: 'Add Goal'}
      </Button>
    </form>
  );
}