'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Goal } from '../page';
import { createClient } from '@/lib/supabase/client';
import { Loader } from 'lucide-react';
import { GOAL_TYPES } from '@/lib/goalTypes';
import { useToast } from '@/components/ui/use-toast';

type AddGoalFormProps = {
  onGoalAdded: (goal: Goal) => void;
  userId: string;
};

export function AddGoalForm({ onGoalAdded, userId }: AddGoalFormProps) {
  const [goalType, setGoalType] = useState('weight_loss');
  const [targetValue, setTargetValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();
  const { toast } = useToast();


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
        toast({ title: 'Goal added', description: 'Your fitness goal was saved.' });

        // Reset form
        setGoalType('weight_loss');
        setTargetValue('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Error adding goal:', err);
      toast({ title: 'Failed to add goal', description: message, variant: 'destructive' });
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
          inputMode="decimal"
          placeholder="Enter target value"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          required
          min="0"
          step="any"
          autoComplete="off"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading…</span>
          </>
        ) : (
          'Add Goal'
        )}
      </Button>
    </form>
  );
}