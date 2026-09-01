import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const [followersRes, postsRes] = await Promise.all([
      admin.from('social_follows').select('id', { count: 'exact', head: true }).eq('followingId', meId),
      admin.from('social_posts').select('id', { count: 'exact', head: true }).eq('profileId', meId),
    ]);

    return NextResponse.json({
      followers: followersRes.count ?? 0,
      posts: postsRes.count ?? 0,
    });
  } catch (error) {
    console.error('sociallog stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
