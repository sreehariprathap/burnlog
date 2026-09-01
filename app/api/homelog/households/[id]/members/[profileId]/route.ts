import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const { id: householdId, profileId: targetProfileId } = await params;
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
    if (!myMembership || myMembership.householdId !== householdId || myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the household owner can remove members' }, { status: 403 });
    }
    if (targetProfileId === me.id) {
      return NextResponse.json({ error: 'Use leave instead of removing yourself' }, { status: 400 });
    }

    const { data: targetMembership } = await admin
      .from('household_members')
      .select('id')
      .eq('householdId', householdId)
      .eq('profileId', targetProfileId)
      .maybeSingle();
    if (!targetMembership) {
      return NextResponse.json({ error: 'That user is not a member of this household' }, { status: 404 });
    }

    const { error: deleteError } = await admin.from('household_members').delete().eq('id', targetMembership.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('remove household member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
