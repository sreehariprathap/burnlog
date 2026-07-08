'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type OutdoorCardioLoggerProps = {
  onEnd: (log: {
    activityType: string;
    durationMinutes: number;
    distanceKm: number;
    notes: string;
    extras: Record<string, boolean>;
  }) => void;
};

const OUTDOOR_ACTIVITIES = ['Running', 'Cycling', 'Brisk Walking', 'Hiking', 'Outdoor HIIT', 'Swimming'];
const EXTRAS = ['Warm-up stretch', 'Cool-down stretch', 'Hill intervals', 'Sprint intervals', 'Fasted'];

export function OutdoorCardioLogger({ onEnd }: OutdoorCardioLoggerProps) {
  const [activityType, setActivityType] = useState('Running');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceKm, setDistanceKm] = useState(0);
  const [notes, setNotes] = useState('');
  const [extras, setExtras] = useState<Record<string, boolean>>(
    Object.fromEntries(EXTRAS.map((e) => [e, false]))
  );

  const toggleExtra = (key: string) =>
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));

  const sessionSuccess = durationMinutes > 0;

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>🌳 Outdoor Cardio</CardTitle>
          <p className="text-sm text-muted-foreground">Log your outdoor session</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Activity</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTDOOR_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-2">
              <Label>Distance (km) — optional</Label>
              <Input
                type="number"
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
            <Label>Notes (optional)</Label>
            <textarea
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

          <div className="flex justify-end">
            <Button onClick={() => onEnd({ activityType, durationMinutes, distanceKm, notes, extras })} disabled={!sessionSuccess}>
              Finish Outdoor Session 🏃
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
