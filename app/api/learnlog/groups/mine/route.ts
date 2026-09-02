import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: membership } = await admin
      .from('learnlog_group_members')
      .select('groupId')
      .eq('profileId', me.id)
      .eq('entityId', entityId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ group: null });
    }

    const { data: group } = await admin.from('learnlog_groups').select('*').eq('id', membership.groupId).single();
    return NextResponse.json({ group });
  } catch (error) {
    console.error('lookup learn group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
