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
    const safeIds = matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000'];

    const [{ data: followRows }, { data: pendingRows }, { data: settingsRows }] = await Promise.all([
      admin.from('social_follows').select('followingId').eq('followerId', me.id).in('followingId', safeIds),
      admin.from('social_follow_requests').select('targetId').eq('requesterId', me.id).eq('status', 'pending').in('targetId', safeIds),
      admin.from('social_profile_settings').select('profileId, isPrivate').in('profileId', safeIds),
    ]);
    const followingIds = new Set((followRows ?? []).map((r) => r.followingId as string));
    const pendingIds = new Set((pendingRows ?? []).map((r) => r.targetId as string));
    const privateById = new Map((settingsRows ?? []).map((s) => [s.profileId as string, s.isPrivate as boolean]));

    const results = (matches ?? []).map((m) => ({
      id: m.id,
      username: m.username,
      firstName: m.firstName,
      avatarUrl: m.avatarUrl,
      isPrivate: privateById.get(m.id) ?? false,
      requestStatus: followingIds.has(m.id) ? 'accepted' : pendingIds.has(m.id) ? 'pending' : 'none',
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('sociallog search users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
