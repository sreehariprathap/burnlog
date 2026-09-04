// app/api/adminlog/users/[id]/reset-onboarding/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

// Resets only the react-joyride app-tour flag — replays on the user's next
// /logbook visit. Does not touch enabledApps or the per-app onboarding
// wizards (BurnLog/MoneyLog); see the app-tour design's non-goals.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ hasSeenAppTour: false })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('adminlog reset-onboarding error:', error);
    return NextResponse.json({ error: 'Failed to reset onboarding' }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
