import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { ensureHabitOccurrences } from '@/lib/habits/materialize';
import type { HabitEndType, HabitRecurrenceType } from '@/lib/habits/habitRecurrence';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, sourceApp, recurrenceType, daysOfWeek, intervalWeeks, endType, endDate, endCount, startDate } =
      body as {
        title?: string;
        sourceApp?: string | null;
        recurrenceType?: HabitRecurrenceType;
        daysOfWeek?: number[];
        intervalWeeks?: number;
        endType?: HabitEndType;
        endDate?: string | null;
        endCount?: number | null;
        startDate?: string;
      };

    if (!title?.trim() || !recurrenceType || !startDate) {
      return NextResponse.json({ error: 'title, recurrenceType, and startDate are required' }, { status: 400 });
    }

    const { data: habit, error } = await admin
      .from('habits')
      .insert([
        {
          profileId,
          title: title.trim(),
          sourceApp: sourceApp ?? null,
          recurrenceType,
          daysOfWeek: daysOfWeek ?? [],
          intervalWeeks: intervalWeeks ?? 1,
          endType: endType ?? 'never',
          endDate: endDate ?? null,
          endCount: endCount ?? null,
          startDate,
        },
      ])
      .select('id')
      .single();

    if (error) throw error;

    await ensureHabitOccurrences(admin, profileId, startDate);

    return NextResponse.json({ id: habit.id }, { status: 201 });
  } catch (error) {
    console.error('habits post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
