import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getMyDayForDate } from '@/lib/myday/day';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date query param (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const data = await getMyDayForDate(admin, profileId, date);
    return NextResponse.json(data);
  } catch (error) {
    console.error('myday get error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { date, title, notes, startTime, endTime, source, sourceId } = body as {
      date?: string;
      title?: string;
      notes?: string | null;
      startTime?: string;
      endTime?: string;
      source?: string;
      sourceId?: string | null;
    };

    if (!date || !title?.trim() || !startTime || !endTime) {
      return NextResponse.json({ error: 'date, title, startTime, and endTime are required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('myday_blocks')
      .insert([
        {
          profileId,
          date,
          title: title.trim(),
          notes: notes?.trim() || null,
          startTime,
          endTime,
          source: source ?? 'manual',
          sourceId: sourceId ?? null,
        },
      ])
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error('myday post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
