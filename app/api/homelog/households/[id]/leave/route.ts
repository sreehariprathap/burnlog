import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: householdId } = await params;
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
      .select('id, householdId, role')
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership || myMembership.householdId !== householdId) {
      return NextResponse.json({ error: 'You are not a member of this household' }, { status: 403 });
    }

    const { data: otherMembers } = await admin
      .from('household_members')
      .select('id, profileId, joinedAt')
      .eq('householdId', householdId)
      .neq('id', myMembership.id)
      .order('joinedAt', { ascending: true });

    const { error: removeError } = await admin.from('household_members').delete().eq('id', myMembership.id);
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 400 });
    }

    if (!otherMembers || otherMembers.length === 0) {
      const { error: deleteHouseholdError } = await admin.from('households').delete().eq('id', householdId);
      if (deleteHouseholdError) {
        return NextResponse.json({ error: deleteHouseholdError.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, householdDeleted: true });
    }

    if (myMembership.role === 'owner') {
      const nextOwner = otherMembers[0];
      const { error: transferError } = await admin
        .from('household_members')
        .update({ role: 'owner' })
        .eq('id', nextOwner.id);
      if (transferError) {
        return NextResponse.json({ error: transferError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, householdDeleted: false });
  } catch (error) {
    console.error('leave household error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
