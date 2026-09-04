// app/api/travellog/passport/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

async function getMyProfileId(admin: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('travellog_passport_entries')
      .select('country, state')
      .eq('profileId', profileId);
    if (error) throw error;

    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    console.error('travellog passport GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PassportEntryInput {
  country?: string;
  state?: string | null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = (await request.json()) as { entries?: PassportEntryInput[] };
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const rows = entries
      .filter((e): e is Required<Pick<PassportEntryInput, 'country'>> & { state: string | null } =>
        typeof e.country === 'string' && e.country.trim().length > 0
      )
      .map((e) => ({ profileId, country: e.country.trim(), state: e.state?.trim() || null }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    const { error } = await admin
      .from('travellog_passport_entries')
      .upsert(rows, { onConflict: 'profileId,country,state' });
    if (error) throw error;

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (error) {
    console.error('travellog passport POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
