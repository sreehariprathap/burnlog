'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type HealthBasicsStepProps = {
  submitting: boolean;
  initialHeight?: number | null;
  initialWeight?: number | null;
  initialActivityLevel?: string | null;
  onSubmit: (answers: { height: number; weight: number; activityLevel: 'low' | 'medium' | 'high' }) => void;
};

export function HealthBasicsStep({ submitting, initialHeight, initialWeight, initialActivityLevel, onSubmit }: HealthBasicsStepProps) {
  const [height, setHeight] = useState(initialHeight ? String(initialHeight) : '');
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : '');
  const [activityLevel, setActivityLevel] = useState<'low' | 'medium' | 'high'>(
    (initialActivityLevel as 'low' | 'medium' | 'high') ?? 'medium'
  );

  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const isValid = heightNum > 0 && weightNum > 0;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Your health basics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Used to estimate calories and build a plan that fits you.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="onboarding-height">Height (cm)</Label>
            <Input
              id="onboarding-height" type="number" min={50} max={250}
              value={height} onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-weight">Weight (kg)</Label>
            <Input
              id="onboarding-weight" type="number" min={20} max={400}
              value={weight} onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Activity level</Label>
          <Select value={activityLevel} onValueChange={(v) => setActivityLevel(v as 'low' | 'medium' | 'high')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="w-full"
          disabled={!isValid || submitting}
          onClick={() => onSubmit({ height: heightNum, weight: weightNum, activityLevel })}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
        </Button>
      </CardContent>
    </Card>
  );
}
