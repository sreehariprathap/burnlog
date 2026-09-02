import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { followingId } = body as { followingId?: string };
    if (!followingId) {
      return NextResponse.json({ error: 'followingId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (me.id === followingId) {
      return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
    }

    const { data: target } = await admin.from('profiles').select('id, userId').eq('id', followingId).maybeSingle();
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: settings } = await admin
      .from('social_profile_settings')
      .select('isPrivate')
      .eq('profileId', followingId)
      .maybeSingle();

    if (settings?.isPrivate) {
      const { data: existingRequest } = await admin
        .from('social_follow_requests')
        .select('id, status')
        .eq('requesterId', me.id)
        .eq('targetId', followingId)
        .maybeSingle();
      if (existingRequest?.status === 'pending') {
        return NextResponse.json({ ok: true, status: 'pending' });
      }

      const { error: upsertError } = await admin
        .from('social_follow_requests')
        .upsert(
          { requesterId: me.id, targetId: followingId, status: 'pending', respondedAt: null },
          { onConflict: 'requesterId,targetId' }
        );
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 400 });
      }

      try {
        const requesterName = me.firstName || me.username;
        await sendPushToUser(admin, target.userId, {
          title: 'New follow request',
          message: `@${me.username} wants to follow you.`,
          url: '/sociallog',
        });
      } catch (pushError) {
        console.error('follow request push error:', pushError);
      }

      return NextResponse.json({ ok: true, status: 'pending' });
    }

    const { error } = await admin
      .from('social_follows')
      .upsert({ followerId: me.id, followingId }, { onConflict: 'followerId,followingId' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: 'accepted' });
  } catch (error) {
    console.error('sociallog follow POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
