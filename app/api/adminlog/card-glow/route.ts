// app/api/adminlog/card-glow/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';
import { isCardGlowPreset, type CardGlowFields } from '@/lib/theme/cardGlow';

type Row = CardGlowFields & { id: string };

// Readable by any signed-in user — every page resolves its glow preset
// through this, not just adminlog.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('adminlog_card_glow_settings').select('id, preset');
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const global = rows.find((r) => r.id === 'global') ?? {};
    const apps: Record<string, CardGlowFields> = {};
    for (const row of rows) {
      if (row.id === 'global') continue;
      const { id, ...fields } = row;
      apps[id] = fields;
    }

    return NextResponse.json({ global, apps });
  } catch (error) {
    console.error('card-glow GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { scope, preset } = body as { scope?: string; preset?: unknown };
    if (scope !== 'global' && !isAppId(scope ?? null)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    if (!isCardGlowPreset(preset)) {
      return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_card_glow_settings')
      .upsert({ id: scope, preset, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('card-glow PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
