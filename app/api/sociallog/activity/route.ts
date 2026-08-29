import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { createActivityPost } from '@/lib/sociallog/createActivityPost';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { sourceApp, sourceRefType, sourceRefId, body: text } = body as {
      sourceApp?: string;
      sourceRefType?: string;
      sourceRefId?: string;
      body?: string;
    };
    if (!sourceApp || !sourceRefType || !sourceRefId || !text) {
      return NextResponse.json({ error: 'sourceApp, sourceRefType, sourceRefId, and body are required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await createActivityPost({ profileId: me.id, sourceApp, sourceRefType, sourceRefId, body: text });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
