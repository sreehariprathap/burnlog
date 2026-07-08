'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { X, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const WORKOUT_TYPES = [
  { value: 'Gym', label: 'Gym' },
  { value: 'Cycling', label: 'Cycling' },
  { value: 'Swimming', label: 'Swimming' },
  { value: 'Other', label: 'Other' },
];

type LogWorkoutModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogWorkoutModal({ profileId, onClose, onSaved }: LogWorkoutModalProps) {
  const supabase = createClientComponentClient();
  const [activityType, setActivityType] = useState('Gym');
  const [duration, setDuration] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEstimate = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration)) || Number(duration) <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityType, durationMinutes: Number(duration) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to estimate calories. Enter manually.');
        return;
      }
      setCaloriesBurned(String(data.caloriesBurned));
    } catch {
      setError('Network error. Enter calories manually.');
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration))) {
      setError('Please enter a valid duration');
      return;
    }
    if (!caloriesBurned || isNaN(Number(caloriesBurned))) {
      setError('Please enter valid calories (or calculate with AI)');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('calorie_burns').insert([
        {
          profileId,
          activityType,
          duration: Number(duration),
          caloriesBurned: Number(caloriesBurned),
        },
      ]);
      if (insertError) throw insertError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Log Workout</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
            <select
              id="activityType"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="duration">Duration (mins)</Label>
            <Input id="duration" type="number" placeholder="Minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="caloriesBurned">Calories Burned</Label>
            <div className="flex gap-2">
              <Input
                id="caloriesBurned"
                type="number"
                placeholder="Calories"
                value={caloriesBurned}
                onChange={(e) => setCaloriesBurned(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleEstimate} disabled={estimating}>
                {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'AI'}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
