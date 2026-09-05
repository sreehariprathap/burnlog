// app/api/adminlog/app-theme/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';
import { isValidCssColor, isValidRadius, type AppThemeFields } from '@/lib/theme/appTheme';

type Row = AppThemeFields & { id: string };

// Readable by any signed-in user — every page reads this to resolve which
// primary/background colors to render, not just adminlog.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_app_theme_settings')
      .select('id, primaryLight, backgroundLight, primaryDark, backgroundDark, radius');
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const global = rows.find((r) => r.id === 'global') ?? {};
    const apps: Record<string, AppThemeFields> = {};
    for (const row of rows) {
      if (row.id === 'global') continue;
      const { id, ...fields } = row;
      apps[id] = fields;
    }

    return NextResponse.json({ global, apps });
  } catch (error) {
    console.error('app-theme GET error:', error);
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

    const update: Record<string, string | null> = {};
    for (const key of ['primaryLight', 'backgroundLight', 'primaryDark', 'backgroundDark'] as const) {
      const value = fields[key];
      if (value === undefined) continue;
      if (value === null) {
        update[key] = null;
        continue;
      }
      if (!isValidCssColor(value)) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
      update[key] = value;
    }

    if (fields.radius !== undefined) {
      const value = fields.radius;
      if (value === null) {
        update.radius = null;
      } else if (!isValidRadius(value)) {
        return NextResponse.json({ error: 'Invalid radius' }, { status: 400 });
      } else {
        update.radius = value;
      }
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_app_theme_settings')
      .upsert({ id: scope, ...update, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('app-theme PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
