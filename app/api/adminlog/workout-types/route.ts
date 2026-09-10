// app/api/adminlog/workout-types/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('burnlog_workout_types')
      .select('id, label, sortOrder, active, createdAt')
      .order('sortOrder', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ workoutTypes: data ?? [] });
  } catch (error) {
    console.error('adminlog workout-types GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { label, sortOrder } = (await request.json()) as { label?: string; sortOrder?: number };
    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('burnlog_workout_types')
      .insert({ label: label.trim(), sortOrder: sortOrder ?? 0 })
      .select('id, label, sortOrder, active, createdAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ workoutType: data });
  } catch (error) {
    console.error('adminlog workout-types POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
