import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createFreshEntity(admin: SupabaseClient, entityType: string, profileId: string, name: string): Promise<string> {
  if (entityType === 'skill') {
    const { data, error } = await admin.from('learnlog_skills').insert({ profileId, name }).select('id').single();
    if (error) throw error;
    return data.id;
  }
  if (entityType === 'library_item') {
    const { data, error } = await admin
      .from('learnlog_library_items')
      .insert({ profileId, title: name, type: 'BOOK', status: 'WANT' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
  if (entityType === 'career_goal') {
    const { data, error } = await admin
      .from('learnlog_career_goals')
      .insert({ profileId, title: name, status: 'active' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
  throw new Error(`Unknown entityType: ${entityType}`);
}

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
      return NextResponse.json({ error: 'Not your invite to accept' }, { status: 403 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite is no longer pending' }, { status: 400 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('entityType, name').eq('id', invite.groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const entityId = await createFreshEntity(admin, group.entityType, me.id, group.name);

    const { error: insertMemberError } = await admin
      .from('learnlog_group_members')
      .upsert({ groupId: invite.groupId, profileId: me.id, entityId, role: 'member' }, { onConflict: 'groupId,profileId' });
    if (insertMemberError) {
      return NextResponse.json({ error: insertMemberError.message }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('learnlog_group_invites')
      .update({ status: 'accepted', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    try {
      const { data: inviter } = await admin.from('profiles').select('userId').eq('id', invite.invitedById).maybeSingle();
      if (inviter) {
        const accepterName = me.firstName || me.username;
        await sendPushToUser(admin, inviter.userId, {
          title: 'Group invite accepted',
          message: `${accepterName} joined "${group.name}".`,
          url: '/learnlog',
        });
      }
    } catch (pushError) {
      console.error('learn group invite-accepted push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept learn group invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
