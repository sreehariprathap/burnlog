// app/api/watchlog/tmdb/videos/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchTrailerKey } from '@/lib/watchlog/tmdb';
import type { MediaType } from '@/lib/watchlog/types';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const tmdbId = Number(params.get('tmdbId'));
    const mediaType = params.get('mediaType') as MediaType | null;
    if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) {
      return NextResponse.json({ error: 'tmdbId and a valid mediaType are required' }, { status: 400 });
    }

    const trailerKey = await fetchTrailerKey(tmdbId, mediaType);
    return NextResponse.json({ trailerKey });
  } catch (error) {
    console.error('watchlog tmdb videos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
