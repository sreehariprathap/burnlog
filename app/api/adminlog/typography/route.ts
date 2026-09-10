// app/api/adminlog/typography/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';
import { isFontId, isFontWeight, isHeadingScale, type TypographyFields } from '@/lib/typography';

type Row = TypographyFields & { id: string };

// Public read — every page, including logged-out ones like /login, reads
// this to resolve which fonts/weight/scale to render.
export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_typography_settings')
      .select('id, headingFont, bodyFont, headingWeight, bodyWeight, headingScale');
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const global = rows.find((r) => r.id === 'global') ?? {};
    const apps: Record<string, TypographyFields> = {};
    for (const row of rows) {
      if (row.id === 'global') continue;
      const { id, ...fields } = row;
      apps[id] = fields;
    }

    return NextResponse.json({ global, apps });
  } catch (error) {
    console.error('typography GET error:', error);
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
    const { scope, ...fields } = body as { scope?: string } & Record<string, unknown>;
    if (scope !== 'global' && !isAppId(scope ?? null)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }

    const update: Record<string, string | number | null> = {};

    for (const key of ['headingFont', 'bodyFont'] as const) {
      const value = fields[key];
      if (value === undefined) continue;
      if (value === null) { update[key] = null; continue; }
      if (!isFontId(value)) return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      update[key] = value;
    }

    for (const key of ['headingWeight', 'bodyWeight'] as const) {
      const value = fields[key];
      if (value === undefined) continue;
      if (value === null) { update[key] = null; continue; }
      if (!isFontWeight(value)) return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      update[key] = value;
    }

    if (fields.headingScale !== undefined) {
      const value = fields.headingScale;
      if (value === null) update.headingScale = null;
      else if (!isHeadingScale(value)) return NextResponse.json({ error: 'Invalid headingScale' }, { status: 400 });
      else update.headingScale = value;
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_typography_settings')
      .upsert({ id: scope, ...update, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('typography PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
