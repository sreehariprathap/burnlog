// app/api/burnlog/workout-types/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Public read — the AI-setup plan preview needs the active workout-type
// list before a profile necessarily exists yet; AdminLog > BurnLog > Workout
// Types does the CRUD.
export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('burnlog_workout_types')
      .select('id, label')
      .eq('active', true)
      .order('sortOrder', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ workoutTypes: data ?? [] });
  } catch (error) {
    console.error('burnlog workout-types GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
