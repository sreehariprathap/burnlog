import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Generic username search shared by every "invite by username" flow across
// apps (HomeLog household invites, TravelLog trip invites, LearnLog group
// shares, and any future one). SocialLog keeps its own dedicated
// /api/sociallog/search/users route since it enriches results with
// follow-status fields this generic version doesn't need.
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: matches } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .ilike('username', `${q}%`)
      .neq('id', me.id)
      .limit(10);

    return NextResponse.json({ results: matches ?? [] });
  } catch (error) {
    console.error('users search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
