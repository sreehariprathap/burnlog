import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
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

    const { data: existing } = await admin
      .from('friendships')
      .select('requesterId, addresseeId')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const excluded = new Set<string>([me.id]);
    for (const row of existing ?? []) {
      excluded.add(row.requesterId === me.id ? row.addresseeId : row.requesterId);
    }

    const { data: matches } = await admin
      .from('profiles')
      .select('id, username, firstName, xp')
      .ilike('username', `${q}%`)
      .limit(20);

    const results = (matches ?? [])
      .filter((m) => !excluded.has(m.id))
      .map((m) => ({ id: m.id, username: m.username, firstName: m.firstName, level: computeLevel(m.xp) }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('social search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
