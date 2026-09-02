// app/(burnlog)/meal-planner/_components/ShoppingDayStep.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ShoppingCart, Calendar } from 'lucide-react';

type ShoppingDayStepProps = {
  profileId: string;
  onDone: () => void;
};

function todayLocalDateString(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function ShoppingDayStep({ profileId, onDone }: ShoppingDayStepProps) {
  const supabase = createClient();
  const [date, setDate] = useState(todayLocalDateString());
  const [time, setTime] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
      title: 'Grocery run',
      message: 'Your grocery list for this week is ready.',
      url: '/burnlog/meal-planner/grocery-list',
      remindAt: remindAt.toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError('Failed to schedule your reminder. Please try again.');
      toast({ title: 'Could not schedule reminder', description: insertError.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reminder scheduled', description: 'We’ll remind you when it’s time to shop.' });
    onDone();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />When are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">We&apos;ll remind you with your list.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="text-sm text-destructive bg-destructive/30 rounded-lg p-3">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="shopping-date">Date</Label>
          <Input id="shopping-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shopping-time">Time</Label>
          <Input id="shopping-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
