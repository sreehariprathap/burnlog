'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { CommuteDetails } from '@/lib/ai/types';

type ActiveCommuteLoggerProps = {
  commuteDetails?: CommuteDetails;
  onEnd: (log: {
    mode: string;
    trips: number;
    distanceKmPerTrip: number;
    durationMinutesPerTrip: number;
    notes: string;
  }) => void;
};

export function ActiveCommuteLogger({ commuteDetails, onEnd }: ActiveCommuteLoggerProps) {
  const defaultMode = (commuteDetails?.preferredMode === 'walk' || commuteDetails?.preferredMode === 'cycle')
    ? commuteDetails.preferredMode
    : 'walk';

  const [mode, setMode] = useState<'walk' | 'cycle'>(defaultMode);
  const [trips, setTrips] = useState<1 | 2>(2);
  // Pre-fill distance from the user's profile if available
  const [distanceKmPerTrip, setDistanceKmPerTrip] = useState(commuteDetails?.distanceKm ?? 3);
  // Estimate duration from distance (walking ~12min/km, cycling ~4min/km)
  const estimatedDuration = commuteDetails?.distanceKm
    ? Math.round(commuteDetails.distanceKm * (defaultMode === 'cycle' ? 4 : 12))
    : 20;
  const [durationMinutesPerTrip, setDurationMinutesPerTrip] = useState(estimatedDuration);
  const [notes, setNotes] = useState('');

  const totalDistance = distanceKmPerTrip * trips;
  const totalDuration = durationMinutesPerTrip * trips;
  const caloriesEstimate = Math.round(
    mode === 'cycle'
      ? totalDuration * 8 // ~8 cal/min moderate cycling
      : totalDuration * 5 // ~5 cal/min brisk walking
  );

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>🚴 Active Commute</CardTitle>
          <p className="text-sm text-muted-foreground">Your commute counts — log it as your workout.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Commute mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'walk' | 'cycle')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="walk">🚶 Walking</SelectItem>
                <SelectItem value="cycle">🚴 Cycling</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Trips today</Label>
            <div className="flex gap-3">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTrips(n)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    trips === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {n === 1 ? 'One-way (to work)' : 'Both ways (to & from)'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Distance per trip (km)</Label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={distanceKmPerTrip}
                onChange={(e) => setDistanceKmPerTrip(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Time per trip (min)</Label>
              <Input
                type="number"
                min={1}
                value={durationMinutesPerTrip}
                onChange={(e) => setDurationMinutesPerTrip(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Summary card */}
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-1">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Today&apos;s commute workout</p>
            <div className="grid grid-cols-3 gap-2 text-center mt-2">
              <div>
                <p className="text-xl font-bold">{totalDistance.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">km total</p>
              </div>
              <div>
                <p className="text-xl font-bold">{totalDuration}</p>
                <p className="text-xs text-muted-foreground">minutes</p>
              </div>
              <div>
                <p className="text-xl font-bold">~{caloriesEstimate}</p>
                <p className="text-xs text-muted-foreground">kcal est.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md h-16 text-sm"
              placeholder="e.g. took the long route, felt great"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() =>
                onEnd({ mode, trips, distanceKmPerTrip, durationMinutesPerTrip, notes })
              }
              disabled={distanceKmPerTrip <= 0 || durationMinutesPerTrip <= 0}
            >
              Log Commute ✅
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
