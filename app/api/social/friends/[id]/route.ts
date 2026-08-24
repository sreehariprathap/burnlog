import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { data: friendship, error: fetchError } = await admin
      .from('friendships')
      .select('id, requesterId, addresseeId')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !friendship) {
      return NextResponse.json({ error: 'Friendship not found' }, { status: 404 });
    }
    if (friendship.requesterId !== me.id && friendship.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Not your friendship to remove' }, { status: 403 });
    }

    const { error: deleteError } = await admin.from('friendships').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('unfriend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
