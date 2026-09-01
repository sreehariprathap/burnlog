// app/session/_components/PlanDaySummary.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PlanDaySummaryProps = {
  date: Date;
  /** The recurring weekday's scheduled body part, or null/'Rest' for a rest day. */
  scheduledBodyPart: string | null;
  /** The actual logged session for this exact date, if any. Only meaningful for past dates. */
  session: { completed: boolean; bodyPart?: string; duration?: number; notes?: string } | null;
};

export function PlanDaySummary({ date, scheduledBodyPart, session }: PlanDaySummaryProps) {
  const label = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const isRestDay = !scheduledBodyPart || scheduledBodyPart === 'Rest';
  const isFuture = date.getTime() > Date.now();

  let title: string;
  let description: string;
  let tone: 'done' | 'missed' | 'rest' | 'upcoming';

  if (isRestDay) {
    title = 'Rest Day';
    description = 'Nothing was scheduled.';
    tone = 'rest';
  } else if (session?.completed) {
    // Prefer what was actually logged over the recurring schedule — a user
    // may have logged a different body part than what was scheduled.
    title = `${session.bodyPart || scheduledBodyPart} — Completed`;
    description = session.notes || 'Logged and completed.';
    tone = 'done';
  } else if (isFuture) {
    title = `${scheduledBodyPart} Day`;
    description = 'Scheduled — come back on the day to log it.';
    tone = 'upcoming';
  } else {
    title = `${scheduledBodyPart} Day — Missed`;
    description = 'No workout was logged for this day.';
    tone = 'missed';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            'font-medium',
            tone === 'done' && 'text-primary',
            tone === 'missed' && 'text-destructive',
            tone === 'rest' && 'text-muted-foreground',
            tone === 'upcoming' && 'text-muted-foreground'
          )}
        >
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {session?.duration ? <p className="text-sm">Duration: {session.duration} minutes</p> : null}
      </CardContent>
    </Card>
  );
}
