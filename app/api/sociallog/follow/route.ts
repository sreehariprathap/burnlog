import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

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
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (me.id === followingId) {
      return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
    }

    const { error } = await admin
      .from('social_follows')
      .upsert({ followerId: me.id, followingId }, { onConflict: 'followerId,followingId' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog follow POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
