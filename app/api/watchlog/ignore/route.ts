// app/api/watchlog/ignore/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { addWatchIgnore } from '@/lib/watchlog/queries';
import type { MediaType } from '@/lib/watchlog/types';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as { tmdbId?: number; mediaType?: MediaType };
    if (!body.tmdbId || !body.mediaType) {
      return NextResponse.json({ error: 'tmdbId and mediaType are required' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await addWatchIgnore(supabase, profile.id, body.tmdbId, body.mediaType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('watchlog ignore error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
