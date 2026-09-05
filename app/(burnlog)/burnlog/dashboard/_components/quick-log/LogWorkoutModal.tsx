'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemedButton } from '@/components/ui/themed-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { COMMON_ACTIVITIES, formatWorkoutNotes } from '@/lib/workoutActivities';
import { useToast } from '@/components/ui/use-toast';

type LogWorkoutModalProps = {
  profileId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function LogWorkoutModal({ profileId, onClose, onSaved }: LogWorkoutModalProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [activityType, setActivityType] = useState<string>(COMMON_ACTIVITIES[0]);
  const [duration, setDuration] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [description, setDescription] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = activityType === 'Other';

  const handleEstimate = async () => {
    setError(null);
    if (!duration || isNaN(Number(duration)) || Number(duration) <= 0) {
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
          durationMinutes: Number(duration),
          distanceKm: distanceKm ? Number(distanceKm) : undefined,
          description: isOther ? description.trim() : undefined,
        }),
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
    if (isOther && !description.trim()) {
      setError('Briefly describe what you did');
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
          notes: formatWorkoutNotes(distanceKm ? Number(distanceKm) : undefined, isOther ? description : undefined),
        },
      ]);
      if (insertError) throw insertError;
      toast({ title: 'Workout logged', description: `${activityType} — ${caloriesBurned} kcal burned.` });
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save workout';
      setError(message);
      toast({ title: 'Failed to save workout', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log Workout</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="activityType">Workout Type</Label>
            <select
              id="activityType"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background md:text-sm"
            >
              {COMMON_ACTIVITIES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="duration">Duration (mins)</Label>
              <Input id="duration" type="number" inputMode="numeric" placeholder="Minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="distanceKm">Distance (km) — optional</Label>
              <Input
                id="distanceKm"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="e.g. 5.2"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </div>
          </div>

          {isOther && (
            <div className="space-y-1">
              <Label htmlFor="description">Briefly describe what you did</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 border rounded-md h-16 text-base md:text-sm"
                placeholder="e.g. 30 min bodyweight circuit: squats, push-ups, lunges"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="caloriesBurned">Calories Burned</Label>
            <div className="flex gap-2">
              <Input
                id="caloriesBurned"
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
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <ThemedButton slot="primary-cta" onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save'}
          </ThemedButton>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
