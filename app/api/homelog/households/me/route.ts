import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Client-side reads can't join other members' profiles directly — `profiles`
// RLS only allows reading your own row (see profiles_select_own in
// supabase/rls.sql). This route does that join server-side instead.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: myMembership } = await admin
      .from('household_members')
      .select('householdId, role')
      .eq('profileId', me.id)
      .maybeSingle();

    if (!myMembership) {
      return NextResponse.json({ household: null, members: [], myRole: null, myProfileId: me.id });
    }

    const [{ data: household }, { data: memberRows }] = await Promise.all([
      admin.from('households').select('id, name, createdAt').eq('id', myMembership.householdId).single(),
      admin
        .from('household_members')
        .select('profileId, role, joinedAt')
        .eq('householdId', myMembership.householdId)
        .order('joinedAt', { ascending: true }),
    ]);

    const profileIds = (memberRows ?? []).map((m) => m.profileId);
    const { data: profiles } = await admin.from('profiles').select('id, username, firstName').in('id', profileIds);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const members = (memberRows ?? []).map((m) => ({
      profileId: m.profileId,
      role: m.role,
      joinedAt: m.joinedAt,
      username: profileById.get(m.profileId)?.username ?? 'unknown',
      firstName: profileById.get(m.profileId)?.firstName ?? 'Unknown',
    }));

    return NextResponse.json({ household, members, myRole: myMembership.role, myProfileId: me.id });
  } catch (error) {
    console.error('get my household error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
