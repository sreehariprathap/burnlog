import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { value } = body as { value?: 1 | -1 };
    if (value !== 1 && value !== -1) {
      return NextResponse.json({ error: 'value must be 1 or -1' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existing } = await admin
      .from('social_votes')
      .select('id, value')
      .eq('postId', postId)
      .eq('profileId', me.id)
      .maybeSingle();

    if (existing && existing.value === value) {
      await admin.from('social_votes').delete().eq('id', existing.id);
      return NextResponse.json({ myVote: null });
    }

    if (existing) {
      await admin.from('social_votes').update({ value }).eq('id', existing.id);
    } else {
      await admin.from('social_votes').insert({ postId, profileId: me.id, value });
    }

    return NextResponse.json({ myVote: value });
  } catch (error) {
    console.error('sociallog vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
