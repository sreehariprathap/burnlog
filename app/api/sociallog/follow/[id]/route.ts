import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: followingId } = await params;
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

    // Handles both unfollowing a confirmed follow and canceling a pending request
    // to a private account — only one of these rows will ever exist for a pair.
    await admin.from('social_follows').delete().eq('followerId', me.id).eq('followingId', followingId);
    await admin.from('social_follow_requests').delete().eq('requesterId', me.id).eq('targetId', followingId).eq('status', 'pending');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog unfollow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
