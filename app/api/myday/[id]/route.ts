import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
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
    const { title, notes, startTime, endTime, completed } = body as {
      title?: string;
      notes?: string | null;
      startTime?: string;
      endTime?: string;
      completed?: boolean;
    };

    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title.trim();
    if (notes !== undefined) update.notes = notes?.trim() || null;
    if (startTime !== undefined) update.startTime = startTime;
    if (endTime !== undefined) update.endTime = endTime;
    if (completed !== undefined) update.completed = completed;

    const { error } = await admin.from('myday_blocks').update(update).eq('id', id).eq('profileId', profileId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('myday patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { error } = await admin.from('myday_blocks').delete().eq('id', id).eq('profileId', profileId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('myday delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
