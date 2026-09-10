'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { BODY_PARTS, type WorkoutPlanEntry } from '@/lib/ai/types';
import { AskAiInput } from '@/components/ai/AskAiInput';
import { apiFetch } from '@/lib/apiFetch';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type WorkoutTypeOption = { id: string; label: string };

async function fetchWorkoutTypes(): Promise<WorkoutTypeOption[]> {
  const res = await apiFetch('/api/burnlog/workout-types');
  if (!res.ok) throw new Error('Failed to load workout types');
  const data = await res.json();
  return data.workoutTypes ?? [];
}

// Falls back to the original hardcoded list if the admin table is ever
// empty or unreachable, so the picker is never blank.
const FALLBACK_OPTIONS: WorkoutTypeOption[] = BODY_PARTS.map((label) => ({ id: label, label }));

type PlanPreviewProps = {
  plan: WorkoutPlanEntry[];
  saving: boolean;
  regenerating: boolean;
  onChange: (plan: WorkoutPlanEntry[]) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onAskAi: (customInstructions: string) => Promise<void>;
  onCancel: () => void;
};

export function PlanPreview({
  plan,
  saving,
  regenerating,
  onChange,
  onSave,
  onRegenerate,
  onAskAi,
  onCancel,
}: PlanPreviewProps) {
  const { data: workoutTypes } = useSWR('burnlog-workout-types', fetchWorkoutTypes);
  const options = workoutTypes && workoutTypes.length > 0 ? workoutTypes : FALLBACK_OPTIONS;

  const setDayBodyPart = (dayOfWeek: number, bodyPart: string) => {
    onChange(plan.map((entry) => (entry.dayOfWeek === dayOfWeek ? { ...entry, bodyPart } : entry)));
  };

  const setDayTime = (dayOfWeek: number, time: string | null) => {
    onChange(plan.map((entry) => (entry.dayOfWeek === dayOfWeek ? { ...entry, time } : entry)));
  };

  const applyTimeToAllDays = (time: string) => {
    onChange(plan.map((entry) => ({ ...entry, time })));
  };

  return (
    <Card className="w-full max-w-lg overflow-x-hidden">
      <CardHeader>
        <CardTitle>Your AI-generated weekly plan</CardTitle>
      </CardHeader>
      <CardContent className="max-w-full space-y-4 overflow-x-hidden">
        <p className="text-sm text-muted-foreground">
          Review your week below. Tap any day to change it, and set a preferred time or leave it flexible.
        </p>
        <div className="space-y-2">
          {plan
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((entry) => {
              const isFlexible = entry.time == null;
              return (
                <div key={entry.dayOfWeek} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-10 font-medium">{DAY_LABELS[entry.dayOfWeek]}</span>
                    <Select value={entry.bodyPart} onValueChange={(value) => setDayBodyPart(entry.dayOfWeek, value)}>
                      <SelectTrigger size="sm" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.label}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={isFlexible}
                        onCheckedChange={(checked) =>
                          setDayTime(entry.dayOfWeek, checked === true ? null : '09:00')
                        }
                      />
                      Flexible (choose later)
                    </label>
                    {!isFlexible && (
                      <>
                        <Input
                          type="time"
                          className="h-7 w-auto min-w-0"
                          value={entry.time ?? ''}
                          onChange={(e) => setDayTime(entry.dayOfWeek, e.target.value)}
                        />
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => applyTimeToAllDays(entry.time as string)}
                        >
                          Apply to all days
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={onRegenerate} disabled={saving || regenerating}>
              {regenerating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Regenerate
            </Button>
            <AskAiInput
              label="Ask AI"
              placeholder="e.g. keep sessions under 30 minutes"
              onSubmit={onAskAi}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving || regenerating}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={onSave} disabled={saving || regenerating}>
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Plan
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
