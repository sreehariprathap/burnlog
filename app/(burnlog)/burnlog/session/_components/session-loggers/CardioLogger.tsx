'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMMON_ACTIVITIES, formatWorkoutNotes } from '@/lib/workoutActivities';
import { useToast } from '@/components/ui/use-toast';

type CardioLoggerProps = {
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm?: number;
    caloriesBurned: number;
    notes?: string;
  }) => void;
};

export function CardioLogger({ onEnd }: CardioLoggerProps) {
  const [activityType, setActivityType] = useState<string>(COMMON_ACTIVITIES[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const isOther = activityType === 'Other';
  const sessionSuccess =
    durationMinutes > 0 &&
    !!caloriesBurned &&
    !isNaN(Number(caloriesBurned)) &&
    (!isOther || !!description.trim());

  const handleEstimate = async () => {
    setError(null);
    if (durationMinutes <= 0) {
      setError('Enter a valid duration first');
      return;
    }
    if (isOther && !description.trim()) {
      setError('Briefly describe what you did first');
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch('/api/ai/estimate-workout-calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType,
          durationMinutes,
          distanceKm: distanceKm > 0 ? distanceKm : undefined,
          description: isOther ? description.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const message = data.error ?? 'Failed to estimate calories. Enter manually.';
        setError(message);
        toast({ title: 'Estimate failed', description: message, variant: 'destructive' });
        return;
      }
      setCaloriesBurned(String(data.caloriesBurned));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Enter calories manually.';
      setError(message);
      toast({ title: 'Estimate failed', description: message, variant: 'destructive' });
    } finally {
      setEstimating(false);
    }
  };

  const handleFinish = () => {
    onEnd({
      activityType,
      durationMinutes,
      distanceKm: distanceKm > 0 ? distanceKm : undefined,
      caloriesBurned: Number(caloriesBurned),
      notes: formatWorkoutNotes(distanceKm > 0 ? distanceKm : undefined, isOther ? description : undefined) ?? undefined,
    });
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Cardio Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label id="cardio-activity-label">Activity</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger aria-labelledby="cardio-activity-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMON_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cardio-duration">Duration (minutes)</Label>
              <Input
                id="cardio-duration"
                type="number"
                inputMode="numeric"
                min={0}
                value={durationMinutes || ''}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="e.g. 30"
              />
              {durationMinutes <= 0 && (
                <p className="text-xs text-destructive">Enter a duration to continue.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cardio-distance">Distance (km) — optional</Label>
              <Input
                id="cardio-distance"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={distanceKm || ''}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                placeholder="e.g. 5.2"
              />
            </div>
          </div>

          {isOther && (
            <div className="space-y-2">
              <Label htmlFor="cardio-description">Briefly describe what you did</Label>
              <textarea
                id="cardio-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-md h-16 text-sm"
                placeholder="e.g. 30 min bodyweight circuit: squats, push-ups, lunges"
              />
              {!description.trim() && (
                <p className="text-xs text-destructive">Description is required for &quot;Other&quot;.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cardio-calories">Calories burned</Label>
            <div className="flex gap-2">
              <Input
                id="cardio-calories"
                type="number"
                inputMode="numeric"
                placeholder="Calories"
                value={caloriesBurned}
                onChange={(e) => setCaloriesBurned(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleEstimate} disabled={estimating}>
                {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'AI'}
              </Button>
            </div>
            {(!caloriesBurned || isNaN(Number(caloriesBurned))) && (
              <p className="text-xs text-destructive">Enter calories burned, or use AI to estimate.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={handleFinish} disabled={!sessionSuccess}>
              Finish Cardio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
