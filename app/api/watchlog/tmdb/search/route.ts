// app/api/watchlog/tmdb/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchTmdb } from '@/lib/watchlog/tmdb';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const query = new URL(request.url).searchParams.get('q')?.trim();
    if (!query) {
      return NextResponse.json({ error: 'q is required' }, { status: 400 });
    }

    const results = await searchTmdb(query);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('watchlog tmdb search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
