import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

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

    const { data: invites } = await admin
      .from('learnlog_group_invites')
      .select('id, groupId, invitedById, createdAt')
      .eq('inviteeId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    const groupIds = [...new Set(invites.map((i) => i.groupId))];
    const inviterIds = [...new Set(invites.map((i) => i.invitedById))];

    const [{ data: groups }, { data: inviters }] = await Promise.all([
      admin.from('learnlog_groups').select('id, name, entityType').in('id', groupIds),
      admin.from('profiles').select('id, username, firstName').in('id', inviterIds),
    ]);

    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    const inviterById = new Map((inviters ?? []).map((p) => [p.id, p]));

    const enriched = invites.map((invite) => ({
      id: invite.id,
      groupId: invite.groupId,
      groupName: groupById.get(invite.groupId)?.name ?? 'Unknown',
      entityType: groupById.get(invite.groupId)?.entityType ?? 'skill',
      invitedByUsername: inviterById.get(invite.invitedById)?.username ?? 'someone',
      createdAt: invite.createdAt,
    }));

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('list learn group invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
