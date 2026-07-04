'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { LifestyleAnswers } from '@/lib/ai/types';

type LifestyleFormProps = {
  submitting: boolean;
  onSubmit: (answers: LifestyleAnswers) => void;
};

export function LifestyleForm({ submitting, onSubmit }: LifestyleFormProps) {
  const [jobType, setJobType] = useState<LifestyleAnswers['jobType']>('desk');
  const [hoursSitting, setHoursSitting] = useState<LifestyleAnswers['hoursSitting']>('4-6');
  const [commuteActivity, setCommuteActivity] = useState<LifestyleAnswers['commuteActivity']>('sedentary');
  const [exerciseFrequency, setExerciseFrequency] = useState<LifestyleAnswers['exerciseFrequency']>('1-2');
  const [goalFocus, setGoalFocus] = useState<LifestyleAnswers['goalFocus']>('general_health');
  const [injuries, setInjuries] = useState('');
  const [preferredTrainingDays, setPreferredTrainingDays] = useState(4);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      jobType,
      hoursSitting,
      commuteActivity,
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

          <div className="space-y-2">
            <Label>Commute activity</Label>
            <Select value={commuteActivity} onValueChange={(v) => setCommuteActivity(v as LifestyleAnswers['commuteActivity'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary (car/public transit)</SelectItem>
                <SelectItem value="walk_or_bike">Walk or bike</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
