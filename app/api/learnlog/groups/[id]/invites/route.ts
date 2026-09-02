import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { inviteeUsername } = (await request.json()) as { inviteeUsername?: string };
    if (!inviteeUsername || !inviteeUsername.trim()) {
      return NextResponse.json({ error: 'inviteeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: myMembership } = await admin
      .from('learnlog_group_members')
      .select('role')
      .eq('groupId', groupId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership || myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the group owner can invite' }, { status: 403 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('name').eq('id', groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data: invitee } = await admin
      .from('profiles')
      .select('id, userId')
      .eq('username', inviteeUsername.trim().toLowerCase())
      .maybeSingle();
    if (!invitee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (invitee.id === me.id) {
      return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
    }

    const { data: existingMember } = await admin
      .from('learnlog_group_members')
      .select('id')
      .eq('groupId', groupId)
      .eq('profileId', invitee.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: 'That user is already in this group' }, { status: 409 });
    }

    const { data: existingInvite } = await admin
      .from('learnlog_group_invites')
      .select('id')
      .eq('groupId', groupId)
      .eq('inviteeId', invitee.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for that user' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await admin
      .from('learnlog_group_invites')
      .insert([{ groupId, invitedById: me.id, inviteeId: invitee.id }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    try {
      const inviterName = me.firstName || me.username;
      await sendPushToUser(admin, invitee.userId, {
        title: 'New learning group invite',
        message: `${inviterName} invited you to join "${group.name}".`,
        url: '/learnlog',
      });
    } catch (pushError) {
      console.error('learn group invite push error:', pushError);
    }

    return NextResponse.json({ invite });
  } catch (error) {
    console.error('create learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
