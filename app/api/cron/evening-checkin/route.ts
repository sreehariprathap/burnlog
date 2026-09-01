// app/api/cron/evening-checkin/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';
import { buildCheckinMessage } from '@/lib/reminders/eveningCheckin';
import { getTodayRange } from '@/lib/dailyTargets';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { data: subRows, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id');

    if (subError) throw subError;

    const userIds = Array.from(new Set((subRows ?? []).map((r) => r.user_id as string)));
    const { start, end } = getTodayRange();

    for (const userId of userIds) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, currentStreak')
          .eq('userId', userId)
          .single();

        if (!profile) {
          skipped += 1;
          continue;
        }

        const [goalsRes, burnRes, eatRes, stepsRes] = await Promise.all([
          supabase.from('fitness_goals').select('goalType, targetValue').eq('profileId', profile.id),
          supabase
            .from('calorie_burns')
            .select('caloriesBurned, duration')
            .eq('profileId', profile.id)
            .gte('date', start)
            .lt('date', end),
          supabase.from('food_intakes').select('calories').eq('profileId', profile.id).gte('date', start).lt('date', end),
          supabase.from('step_entries').select('steps').eq('profileId', profile.id).gte('date', start).lt('date', end),
        ]);

        const burnRows = (burnRes.data as { caloriesBurned: number; duration: number }[]) || [];
        const eatRows = (eatRes.data as { calories: number }[]) || [];
        const stepRows = (stepsRes.data as { steps: number }[]) || [];

        const metrics = {
          burn: burnRows.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0),
          eat: eatRows.reduce((sum, r) => sum + (r.calories || 0), 0),
          workoutMinutes: burnRows.reduce((sum, r) => sum + (r.duration || 0), 0),
          steps: stepRows.reduce((sum, r) => sum + (r.steps || 0), 0),
        };

        const hasWorkoutToday = burnRows.length > 0;
        const hasAnyActivityToday = hasWorkoutToday || metrics.eat > 0 || metrics.steps > 0;

        const message = buildCheckinMessage({
          goals: (goalsRes.data as { goalType: string; targetValue: number }[]) || [],
          metrics,
          hasWorkoutToday,
          hasAnyActivityToday,
          currentStreak: profile.currentStreak ?? 0,
        });

        if (!message) {
          skipped += 1;
          continue;
        }

        await sendPushToUser(supabase, userId, {
          title: 'Evening Check-In',
          message,
          url: '/burnlog/dashboard',
        });
        sent += 1;
      } catch (perUserError) {
        console.error(`evening-checkin failed for user ${userId}:`, perUserError);
        errors += 1;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (error) {
    console.error('evening-checkin cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
