import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { data: invite, error: fetchError } = await admin
      .from('household_invites')
      .select('id, householdId, inviteeId, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.inviteeId !== me.id) {
      return NextResponse.json({ error: 'Not your invite to accept' }, { status: 403 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is no longer pending' }, { status: 400 });
    }

    const { data: existingMembership } = await admin
      .from('household_members')
      .select('id')
      .eq('profileId', me.id)
      .maybeSingle();
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a household' }, { status: 409 });
    }

    const { error: insertMemberError } = await admin
      .from('household_members')
      .insert([{ householdId: invite.householdId, profileId: me.id, role: 'member' }]);
    if (insertMemberError) {
      return NextResponse.json({ error: insertMemberError.message }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('household_invites')
      .update({ status: 'accepted', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept household invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
