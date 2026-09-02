import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import type { SupabaseClient } from '@supabase/supabase-js';

const ENTITY_TABLE: Record<string, string> = {
  skill: 'learnlog_skills',
  library_item: 'learnlog_library_items',
  career_goal: 'learnlog_career_goals',
};

async function resolveEntities(admin: SupabaseClient, entityType: string, ids: string[]) {
  const table = ENTITY_TABLE[entityType];
  if (!table || ids.length === 0) return new Map();
  const { data } = await admin.from(table).select('*').in('id', ids);
  return new Map((data ?? []).map((row: { id: string }) => [row.id, row]));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
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
      .from('learnlog_group_members')
      .select('role')
      .eq('groupId', groupId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', groupId).maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data: memberRows } = await admin
      .from('learnlog_group_members')
      .select('profileId, entityId, role, joinedAt')
      .eq('groupId', groupId);

    const profileIds = (memberRows ?? []).map((m) => m.profileId);
    const entityIds = (memberRows ?? []).map((m) => m.entityId);
    const [{ data: profiles }, entityById] = await Promise.all([
      admin.from('profiles').select('id, username, firstName, avatarUrl').in('id', profileIds.length ? profileIds : ['00000000-0000-0000-0000-000000000000']),
      resolveEntities(admin, group.entityType, entityIds),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const members = (memberRows ?? []).map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      profile: profileById.get(m.profileId) ?? null,
      entity: entityById.get(m.entityId) ?? null,
    }));

    return NextResponse.json({ group, myRole: myMembership.role, members });
  } catch (error) {
    console.error('get learn group detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
