// app/api/adminlog/users/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

// profiles' RLS only allows reading your own row — listing everyone here
// needs the service-role client, gated behind requireAdminCaller.
export async function GET() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, firstName, lastName, avatarUrl, isAdmin, isTestAccount, enabledApps, currentStreak, level, createdAt, hasSeenAppTour')
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('adminlog users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
