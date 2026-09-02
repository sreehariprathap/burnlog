'use client';

import React, { useState } from 'react';
import { Loader2, TreePine } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { LifestyleAnswers } from '@/lib/ai/types';
import { useToast } from '@/components/ui/use-toast';

type OutdoorCardioLoggerProps = {
  lifestyle?: LifestyleAnswers | null;
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm?: number;
    caloriesBurned: number;
    notes?: string;
  }) => void;
};

const BASE_ACTIVITIES = ['Running', 'Cycling', 'Brisk Walking', 'Hiking', 'Outdoor HIIT', 'Swimming'];
const EXTRAS = ['Warm-up stretch', 'Cool-down stretch', 'Hill intervals', 'Sprint intervals', 'Fasted'];

export function OutdoorCardioLogger({ lifestyle, onEnd }: OutdoorCardioLoggerProps) {
  const hasOutdoorSpace = lifestyle?.equipment?.homeEnvironment?.hasOutdoorSpace;
  const nearbyPark = lifestyle?.equipment?.homeEnvironment?.nearbyPark;

  // Suggest activities based on what the user has access to
  const activities = [
    ...BASE_ACTIVITIES,
    ...(hasOutdoorSpace ? ['Garden HIIT Circuit', 'Backyard Sprint Intervals'] : []),
    ...(nearbyPark ? ['Park Trail Run', 'Park Bench Workout', 'Outdoor Yoga'] : []),
  ];

  const [activityType, setActivityType] = useState(activities[0]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceKm, setDistanceKm] = useState(0);
  const [notes, setNotes] = useState('');
  const [extras, setExtras] = useState<Record<string, boolean>>(
    Object.fromEntries(EXTRAS.map((e) => [e, false]))
  );
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleExtra = (key: string) =>
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));

  const sessionSuccess = durationMinutes > 0 && !!caloriesBurned && !isNaN(Number(caloriesBurned));

  const buildNotes = () => {
    const activeExtras = Object.entries(extras).filter(([, v]) => v).map(([k]) => k);
    return [notes.trim(), activeExtras.length ? `Extras: ${activeExtras.join(', ')}` : '']
      .filter(Boolean)
      .join('\n') || undefined;
  };

  const handleEstimate = async () => {
    setError(null);
    if (durationMinutes <= 0) {
      setError('Enter a valid duration first');
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

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TreePine className="h-5 w-5" />
            Outdoor Cardio
          </CardTitle>
          <p className="text-sm text-muted-foreground">Log your outdoor session</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label id="outdoor-activity-label">Activity</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger aria-labelledby="outdoor-activity-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outdoor-duration">Duration (minutes)</Label>
              <Input
                id="outdoor-duration"
                type="number"
                inputMode="numeric"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="e.g. 30"
              />
              {durationMinutes <= 0 && (
                <p className="text-xs text-destructive">Enter a duration to continue.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="outdoor-distance">Distance (km) — optional</Label>
              <Input
                id="outdoor-distance"
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

          <div className="space-y-2">
            <Label>Extras</Label>
            <div className="grid grid-cols-2 gap-2">
              {EXTRAS.map((ex) => (
                <label key={ex} className="flex items-center space-x-2">
                  <Checkbox checked={extras[ex]} onCheckedChange={() => toggleExtra(ex)} />
                  <span className="text-sm">{ex}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outdoor-notes">Notes (optional)</Label>
            <textarea
              id="outdoor-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md h-16 text-sm"
              placeholder="How did it feel? Any highlights?"
            />
          </div>

          {durationMinutes > 0 && distanceKm > 0 && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-center">
              Avg pace: {(durationMinutes / distanceKm).toFixed(1)} min/km
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="outdoor-calories">Calories burned</Label>
            <div className="flex gap-2">
              <Input
                id="outdoor-calories"
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button
              onClick={() =>
                onEnd({
                  activityType,
                  durationMinutes,
                  distanceKm: distanceKm > 0 ? distanceKm : undefined,
                  caloriesBurned: Number(caloriesBurned),
                  notes: buildNotes(),
                })
              }
              disabled={!sessionSuccess}
            >
              Finish Outdoor Session
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
