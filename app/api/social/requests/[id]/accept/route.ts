import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: request_, error: fetchError } = await admin
      .from('friendships')
      .select('id, addresseeId, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !request_) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request_.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Not your request to accept' }, { status: 403 });
    }
    if (request_.status !== 'pending') {
      return NextResponse.json({ error: 'Request is no longer pending' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('friendships')
      .update({ status: 'accepted', respondedAt: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept friend request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
