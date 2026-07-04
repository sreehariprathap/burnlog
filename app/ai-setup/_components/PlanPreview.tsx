'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { BODY_PARTS, type WorkoutPlanEntry } from '@/lib/ai/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type PlanPreviewProps = {
  plan: WorkoutPlanEntry[];
  saving: boolean;
  regenerating: boolean;
  onChange: (plan: WorkoutPlanEntry[]) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
};

export function PlanPreview({
  plan,
  saving,
  regenerating,
  onChange,
  onSave,
  onRegenerate,
  onCancel,
}: PlanPreviewProps) {
  const setDayBodyPart = (dayOfWeek: number, bodyPart: WorkoutPlanEntry['bodyPart']) => {
    onChange(plan.map((entry) => (entry.dayOfWeek === dayOfWeek ? { ...entry, bodyPart } : entry)));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Your AI-generated weekly plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Review your week below. Tap any day to change it before saving.
        </p>
        <div className="space-y-3">
          {plan
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((entry) => (
              <div key={entry.dayOfWeek} className="flex items-center justify-between gap-2">
                <span className="w-10 font-medium">{DAY_LABELS[entry.dayOfWeek]}</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {BODY_PARTS.map((bp) => (
                    <button
                      key={bp}
                      type="button"
                      onClick={() => setDayBodyPart(entry.dayOfWeek, bp)}
                      className={`px-2 py-1 text-xs rounded-md border ${
                        entry.bodyPart === bp
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      {bp}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onCancel} disabled={saving || regenerating}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRegenerate} disabled={saving || regenerating}>
              {regenerating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Regenerate
            </Button>
            <Button onClick={onSave} disabled={saving || regenerating}>
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Plan
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
