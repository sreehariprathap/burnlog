// app/api/adminlog/workout-types/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json()) as { label?: string; sortOrder?: number; active?: boolean };
    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label.trim();
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;
    if (body.active !== undefined) update.active = body.active;

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('burnlog_workout_types')
      .update(update)
      .eq('id', id)
      .select('id, label, sortOrder, active, createdAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ workoutType: data });
  } catch (error) {
    console.error('adminlog workout-type PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.from('burnlog_workout_types').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('adminlog workout-type DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
