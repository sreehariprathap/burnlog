// app/ai-setup/_components/ActivityPreferencesStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_TYPES, type ActivityPreferences } from '@/lib/ai/types';

type ActivityPreferencesStepProps = {
  onContinue: (answers: ActivityPreferences) => void;
  onSkip: () => void;
};

export function ActivityPreferencesStep({ onContinue, onSkip }: ActivityPreferencesStepProps) {
  const [enjoyedTypes, setEnjoyedTypes] = useState<string[]>([]);
  const [dislikedTypes, setDislikedTypes] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<ActivityPreferences['environment']>('either');
  const [social, setSocial] = useState<ActivityPreferences['social']>('either');

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>What kind of activity do you enjoy?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Types you enjoy</Label>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <Checkbox
                  checked={enjoyedTypes.includes(type)}
                  onCheckedChange={() => toggle(enjoyedTypes, setEnjoyedTypes, type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Types you dislike</Label>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type} className="flex items-center space-x-2">
                <Checkbox
                  checked={dislikedTypes.includes(type)}
                  onCheckedChange={() => toggle(dislikedTypes, setDislikedTypes, type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Indoor or outdoor?</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as ActivityPreferences['environment'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="indoor">Indoor</SelectItem>
              <SelectItem value="outdoor">Outdoor</SelectItem>
              <SelectItem value="either">Either</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Solo or group?</Label>
          <Select value={social} onValueChange={(v) => setSocial(v as ActivityPreferences['social'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">Solo</SelectItem>
              <SelectItem value="group">Group classes</SelectItem>
              <SelectItem value="either">Either</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button
            type="button"
            onClick={() => onContinue({ enjoyedTypes, dislikedTypes, environment, social })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
