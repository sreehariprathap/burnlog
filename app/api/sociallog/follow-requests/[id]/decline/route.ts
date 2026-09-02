import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: reqRow, error: fetchError } = await admin
      .from('social_follow_requests')
      .select('id, requesterId, targetId, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !reqRow) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (reqRow.targetId !== me.id) {
      return NextResponse.json({ error: 'Not your request to decline' }, { status: 403 });
    }
    if (reqRow.status !== 'pending') {
      return NextResponse.json({ error: 'Request is no longer pending' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('social_follow_requests')
      .update({ status: 'declined', respondedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Best-effort — a missing/expired push subscription shouldn't fail the decline.
    try {
      const { data: requester } = await admin.from('profiles').select('userId').eq('id', reqRow.requesterId).maybeSingle();
      if (requester) {
        await sendPushToUser(admin, requester.userId, {
          title: 'Follow request declined',
          message: `@${me.username} declined your follow request.`,
          url: '/sociallog',
        });
      }
    } catch (pushError) {
      console.error('follow-request-declined push error:', pushError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('decline follow request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
