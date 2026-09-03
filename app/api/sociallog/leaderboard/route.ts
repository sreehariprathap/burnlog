import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfile(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id, username, firstName, avatarUrl').eq('userId', userId).single();
  return data as { id: string; username: string; firstName: string; avatarUrl: string | null } | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const me = await getMyProfile(admin, user.id);
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [followingRes, followerRes] = await Promise.all([
      admin.from('social_follows').select('followingId').eq('followerId', me.id),
      admin.from('social_follows').select('followerId').eq('followingId', me.id),
    ]);

    const followingIds = new Set(((followingRes.data as { followingId: string }[]) || []).map((r) => r.followingId));
    const followerIds = new Set(((followerRes.data as { followerId: string }[]) || []).map((r) => r.followerId));
    const mutualIds = [...followingIds].filter((id) => followerIds.has(id));

    const profileIds = [me.id, ...mutualIds];

    const [profilesRes, snapshotsRes] = await Promise.all([
      admin.from('profiles').select('id, username, firstName, avatarUrl').in('id', profileIds),
      admin
        .from('life_score_snapshots')
        .select('profileId, date, engagementScore')
        .in('profileId', profileIds)
        .order('date', { ascending: false }),
    ]);

    const profiles = (profilesRes.data as { id: string; username: string; firstName: string; avatarUrl: string | null }[]) || [];
    const snapshots = (snapshotsRes.data as { profileId: string; date: string; engagementScore: number | null }[]) || [];

    const latestScoreByProfile = new Map<string, number | null>();
    for (const row of snapshots) {
      if (!latestScoreByProfile.has(row.profileId)) {
        latestScoreByProfile.set(row.profileId, row.engagementScore);
      }
    }

    const entries = profiles
      .map((p) => ({
        profileId: p.id,
        username: p.username,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        score: latestScoreByProfile.get(p.id) ?? null,
        isMe: p.id === me.id,
      }))
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('sociallog leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
