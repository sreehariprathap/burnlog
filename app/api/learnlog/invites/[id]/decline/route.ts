import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: invite, error: fetchError } = await admin
      .from('learnlog_group_invites')
      .select('id, groupId, invitedById, inviteeId, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.inviteeId !== me.id) {
      return NextResponse.json({ error: 'Not your invite to decline' }, { status: 403 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is no longer pending' }, { status: 400 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('name').eq('id', invite.groupId).maybeSingle();

    const { error: updateError } = await admin
      .from('learnlog_group_invites')
      .update({ status: 'declined', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    try {
      const { data: inviter } = await admin.from('profiles').select('userId').eq('id', invite.invitedById).maybeSingle();
      if (inviter) {
        const declinerName = me.firstName || me.username;
        await sendPushToUser(admin, inviter.userId, {
          title: 'Group invite declined',
          message: `${declinerName} declined your invite to "${group?.name ?? 'your group'}".`,
          url: '/learnlog',
        });
      }
    } catch (pushError) {
      console.error('learn group invite-declined push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('decline learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
