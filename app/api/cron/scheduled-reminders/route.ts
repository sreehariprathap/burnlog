// app/api/cron/scheduled-reminders/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

type ReminderRow = {
  id: string;
  profileId: string;
  title: string;
  message: string;
  url: string;
  remindAt: string | null;
  dayOfWeek: number | null;
  timeOfDay: string | null;
  timezone: string | null;
  lastSentAt: string | null;
  sentAt: string | null;
};

function localPartsInTimezone(timezone: string, now: Date): { weekday: number; hhmm: string; isoDate: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[get('weekday')] ?? -1,
    hhmm: `${get('hour')}:${get('minute')}`,
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function withinWindow(target: string, current: string, windowMinutes: number): boolean {
  const [targetH, targetM] = target.split(':').map(Number);
  const [curH, curM] = current.split(':').map(Number);
  const targetTotal = targetH * 60 + targetM;
  const curTotal = curH * 60 + curM;
  const diff = (curTotal - targetTotal + 1440) % 1440;
  return diff < windowMinutes;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { data: rows, error } = await supabase
      .from('scheduled_reminders')
      .select('id, profileId, title, message, url, remindAt, dayOfWeek, timeOfDay, timezone, lastSentAt, sentAt');
    if (error) throw error;

    for (const row of (rows ?? []) as ReminderRow[]) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('userId')
          .eq('id', row.profileId)
          .single();
        if (!profile) {
          skipped += 1;
          continue;
        }

        let shouldSend = false;
        let markSentField: 'sentAt' | 'lastSentAt' | null = null;
        let markSentValue: string | null = null;

        if (row.remindAt) {
          // one-off
          if (!row.sentAt && new Date(row.remindAt) <= now) {
            shouldSend = true;
            markSentField = 'sentAt';
            markSentValue = now.toISOString();
          }
        } else if (row.dayOfWeek !== null && row.timeOfDay && row.timezone) {
          // recurring weekly
          const { weekday, hhmm, isoDate } = localPartsInTimezone(row.timezone, now);
          if (weekday === row.dayOfWeek && withinWindow(row.timeOfDay, hhmm, 15) && row.lastSentAt !== isoDate) {
            shouldSend = true;
            markSentField = 'lastSentAt';
            markSentValue = isoDate;
          }
        }

        if (!shouldSend) {
          skipped += 1;
          continue;
        }

        await sendPushToUser(supabase, profile.userId, { title: row.title, message: row.message, url: row.url });

        if (markSentField) {
          await supabase.from('scheduled_reminders').update({ [markSentField]: markSentValue }).eq('id', row.id);
        }
        sent += 1;
      } catch (perRowError) {
        console.error(`scheduled-reminders failed for reminder ${row.id}:`, perRowError);
        errors += 1;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (error) {
    console.error('scheduled-reminders cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
