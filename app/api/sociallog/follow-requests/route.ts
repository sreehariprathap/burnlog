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

    const { data: requests } = await admin
      .from('social_follow_requests')
      .select('id, requesterId, createdAt')
      .eq('targetId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!requests || requests.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    const requesterIds = [...new Set(requests.map((r) => r.requesterId))];
    const { data: requesters } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .in('id', requesterIds);
    const requesterById = new Map((requesters ?? []).map((p) => [p.id, p]));

    const enriched = requests.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      requester: requesterById.get(r.requesterId) ?? null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (error) {
    console.error('list follow requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
