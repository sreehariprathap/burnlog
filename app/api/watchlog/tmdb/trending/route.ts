// app/api/watchlog/tmdb/trending/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trendingTmdb } from '@/lib/watchlog/tmdb';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const results = await trendingTmdb('week');
    return NextResponse.json({ results });
  } catch (error) {
    console.error('watchlog tmdb trending error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
