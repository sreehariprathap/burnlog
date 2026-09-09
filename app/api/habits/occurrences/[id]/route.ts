import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const { completed } = body as { completed?: boolean };
    if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'completed (boolean) is required' }, { status: 400 });
    }

    const { data: occurrence } = await admin.from('habit_occurrences').select('id, habitId').eq('id', id).single();
    if (!occurrence) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: habit } = await admin
      .from('habits')
      .select('id')
      .eq('id', occurrence.habitId)
      .eq('profileId', profileId)
      .single();
    if (!habit) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await admin
      .from('habit_occurrences')
      .update({ completed, completedAt: completed ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('habit occurrence patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
