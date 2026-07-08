'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import type { LifestyleAnswers, CommuteDetails } from '@/lib/ai/types';

type LifestyleFormProps = {
  submitting: boolean;
  initialAnswers?: LifestyleAnswers | null;
  onSubmit: (answers: LifestyleAnswers) => void;
};

export function LifestyleForm({ submitting, initialAnswers, onSubmit }: LifestyleFormProps) {
  const [jobType, setJobType] = useState<LifestyleAnswers['jobType']>(initialAnswers?.jobType ?? 'desk');
  const [hoursSitting, setHoursSitting] = useState<LifestyleAnswers['hoursSitting']>(initialAnswers?.hoursSitting ?? '4-6');
  const [commuteActivity, setCommuteActivity] = useState<LifestyleAnswers['commuteActivity']>(initialAnswers?.commuteActivity ?? 'sedentary');
  const [commuteMode, setCommuteMode] = useState<CommuteDetails['preferredMode']>(
    initialAnswers?.commuteDetails?.preferredMode ?? 'drive'
  );
  const [commuteDistanceKm, setCommuteDistanceKm] = useState<number>(
    initialAnswers?.commuteDetails?.distanceKm ?? 5
  );
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState<number>(
    initialAnswers?.commuteDetails?.workDaysPerWeek ?? 5
  );
  const [exerciseFrequency, setExerciseFrequency] = useState<LifestyleAnswers['exerciseFrequency']>(initialAnswers?.exerciseFrequency ?? '1-2');
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>(initialAnswers?.goalFocus ?? 'general_health');
  const [injuries, setInjuries] = useState(initialAnswers?.injuries ?? '');
  const [preferredTrainingDays, setPreferredTrainingDays] = useState(initialAnswers?.preferredTrainingDays ?? 4);

  const showCommuteDetails = jobType !== 'not_working';
  const isActiveCommuter = commuteMode === 'walk' || commuteMode === 'cycle';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const commuteDetails: CommuteDetails | undefined = showCommuteDetails
      ? { distanceKm: commuteDistanceKm, preferredMode: commuteMode, workDaysPerWeek }
      : undefined;
    onSubmit({
      jobType,
      hoursSitting,
      commuteActivity: isActiveCommuter ? 'walk_or_bike' : 'sedentary',
      commuteDetails,
      exerciseFrequency,
      goalFocus,
      injuries,
      preferredTrainingDays,
    });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Tell us about your lifestyle</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>What kind of work do you do?</Label>
            <Select value={jobType} onValueChange={(v) => setJobType(v as LifestyleAnswers['jobType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desk">Desk job (mostly sitting)</SelectItem>
                <SelectItem value="physical">Physical labor (mostly standing/moving)</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="not_working">Not currently working</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Hours sitting per day</Label>
            <Select value={hoursSitting} onValueChange={(v) => setHoursSitting(v as LifestyleAnswers['hoursSitting'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="<2">Less than 2</SelectItem>
                <SelectItem value="2-4">2-4</SelectItem>
                <SelectItem value="4-6">4-6</SelectItem>
                <SelectItem value="6-8">6-8</SelectItem>
                <SelectItem value="8+">8 or more</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showCommuteDetails && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <p className="text-sm font-medium">Commute & workplace</p>

              <div className="space-y-2">
                <Label>How do you get to work?</Label>
                <Select value={commuteMode} onValueChange={(v) => setCommuteMode(v as CommuteDetails['preferredMode'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drive">Drive / Car</SelectItem>
                    <SelectItem value="transit">Public transit</SelectItem>
                    <SelectItem value="walk">Walk</SelectItem>
                    <SelectItem value="cycle">Cycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Distance to work (km)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={commuteDistanceKm}
                  onChange={(e) => setCommuteDistanceKm(Number(e.target.value))}
                  placeholder="e.g. 4"
                />
                {isActiveCommuter && commuteDistanceKm > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ✅ Your commute can count as a workout day!
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Days per week you go to the workplace: {workDaysPerWeek}</Label>
                <input
                  type="range"
                  min={1}
                  max={7}
                  step={1}
                  value={workDaysPerWeek}
                  onChange={(e) => setWorkDaysPerWeek(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Current exercise frequency</Label>
            <Select value={exerciseFrequency} onValueChange={(v) => setExerciseFrequency(v as LifestyleAnswers['exerciseFrequency'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="1-2">1-2x per week</SelectItem>
                <SelectItem value="3-4">3-4x per week</SelectItem>
                <SelectItem value="5+">5+ per week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Primary goal</Label>
            <Select value={goalFocus} onValueChange={(v) => setGoalFocus(v as LifestyleAnswers['goalFocus'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lose_weight">Lose weight</SelectItem>
                <SelectItem value="build_muscle">Build muscle</SelectItem>
                <SelectItem value="improve_stamina">Improve stamina</SelectItem>
                <SelectItem value="general_health">General health</SelectItem>
                <SelectItem value="athletic_performance">Athletic performance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="injuries">Injuries or physical limitations (optional)</Label>
            <textarea
              id="injuries"
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              className="w-full p-2 border rounded-md h-20"
              placeholder="e.g. bad left knee, avoid heavy overhead lifting"
            />
          </div>

          <div className="space-y-2">
            <Label>Preferred training days per week: {preferredTrainingDays}</Label>
            <input
              type="range"
              min={3}
              max={6}
              step={1}
              value={preferredTrainingDays}
              onChange={(e) => setPreferredTrainingDays(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Generate My Plan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
