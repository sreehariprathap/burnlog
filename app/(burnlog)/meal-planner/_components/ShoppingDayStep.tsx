// app/(burnlog)/meal-planner/_components/ShoppingDayStep.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type ShoppingDayStepProps = {
  profileId: string;
  onDone: () => void;
};

export function ShoppingDayStep({ profileId, onDone }: ShoppingDayStepProps) {
  const supabase = createClientComponentClient();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!date) {
      setError('Pick a date first.');
      return;
    }
    setSaving(true);
    setError(null);
    const remindAt = new Date(`${date}T${time}`);
    const { error: insertError } = await supabase.from('scheduled_reminders').insert({
      profileId,
      title: 'Grocery run 🛒',
      message: 'Your grocery list for this week is ready.',
      url: '/meal-planner/grocery-list',
      remindAt: remindAt.toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError('Failed to schedule your reminder. Please try again.');
      return;
    }
    onDone();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🗓️ When are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">We&apos;ll remind you with your list.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Done →'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
