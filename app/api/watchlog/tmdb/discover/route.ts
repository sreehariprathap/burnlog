// app/api/watchlog/tmdb/discover/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverTmdb } from '@/lib/watchlog/tmdb';
import type { TmdbItem } from '@/lib/watchlog/types';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const movieGenreId = params.get('movieGenreId');
    const tvGenreId = params.get('tvGenreId');
    const originalLanguage = params.get('originalLanguage') ?? undefined;

    if (!movieGenreId && !originalLanguage) {
      return NextResponse.json({ error: 'movieGenreId or originalLanguage is required' }, { status: 400 });
    }

    const calls: Promise<TmdbItem[]>[] = [];
    if (movieGenreId || originalLanguage) {
      calls.push(discoverTmdb({ mediaType: 'movie', genreIds: movieGenreId ? [Number(movieGenreId)] : [], originalLanguage }));
    }
    if (tvGenreId) {
      calls.push(discoverTmdb({ mediaType: 'tv', genreIds: [Number(tvGenreId)] }));
    }

    const settled = await Promise.all(calls);
    const results = settled.map((r) => r.slice(0, 8)).flat().slice(0, 15);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('watchlog tmdb discover error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
