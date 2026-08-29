import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: matches } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .ilike('username', `${q}%`)
      .neq('id', me.id)
      .limit(20);

    const matchIds = (matches ?? []).map((m) => m.id);
    const { data: followRows } = await admin
      .from('social_follows')
      .select('followingId')
      .eq('followerId', me.id)
      .in('followingId', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000']);
    const followingIds = new Set((followRows ?? []).map((r) => r.followingId as string));

    const results = (matches ?? []).map((m) => ({
      id: m.id,
      username: m.username,
      firstName: m.firstName,
      avatarUrl: m.avatarUrl,
      isFollowing: followingIds.has(m.id),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('sociallog search users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
