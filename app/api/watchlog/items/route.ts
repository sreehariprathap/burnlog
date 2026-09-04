// app/api/watchlog/items/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { addWatchItem } from '@/lib/watchlog/queries';
import type { TmdbItem } from '@/lib/watchlog/types';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<TmdbItem>;
    if (!body.tmdbId || !body.mediaType || !body.title) {
      return NextResponse.json({ error: 'tmdbId, mediaType, and title are required' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const item = await addWatchItem(supabase, profile.id, body as TmdbItem);
    return NextResponse.json({ item });
  } catch (error) {
    console.error('watchlog add item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
