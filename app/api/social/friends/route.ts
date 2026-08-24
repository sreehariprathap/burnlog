import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: rows } = await admin
      .from('friendships')
      .select('id, requesterId, addresseeId')
      .eq('status', 'accepted')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const friendIds = (rows ?? []).map((r) => (r.requesterId === me.id ? r.addresseeId : r.requesterId));
    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl, xp, currentStreak')
      .in('id', friendIds);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const friends = (rows ?? [])
      .map((r) => {
        const friendId = r.requesterId === me.id ? r.addresseeId : r.requesterId;
        const p = profileById.get(friendId);
        if (!p) return null;
        return {
          friendshipId: r.id,
          profileId: p.id,
          username: p.username,
          firstName: p.firstName,
          avatarUrl: p.avatarUrl,
          xp: p.xp,
          level: computeLevel(p.xp),
          currentStreak: p.currentStreak,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return NextResponse.json({ friends });
  } catch (error) {
    console.error('list friends error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
