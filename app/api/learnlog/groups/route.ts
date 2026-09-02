import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { entityType, entityId, name } = (await request.json()) as {
      entityType?: string;
      entityId?: string;
      name?: string;
    };
    if (!entityType || !entityId || !name) {
      return NextResponse.json({ error: 'entityType, entityId, and name are required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existingMembership } = await admin
      .from('learnlog_group_members')
      .select('groupId')
      .eq('profileId', me.id)
      .eq('entityId', entityId)
      .maybeSingle();
    if (existingMembership) {
      const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', existingMembership.groupId).single();
      return NextResponse.json({ group });
    }

    const { data: group, error: groupError } = await admin
      .from('learnlog_groups')
      .insert({ entityType, name })
      .select()
      .single();
    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 400 });
    }

    const { error: memberError } = await admin
      .from('learnlog_group_members')
      .insert({ groupId: group.id, profileId: me.id, entityId, role: 'owner' });
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('create learn group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
