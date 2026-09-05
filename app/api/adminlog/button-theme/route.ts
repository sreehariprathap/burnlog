// app/api/adminlog/button-theme/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';
import { BUTTON_SLOTS, isButtonStyle } from '@/lib/buttonThemes';

// Readable by any signed-in user — every app reads this to decide how its
// themed buttons should render, not just adminlog. Shape mirrors the
// app-theme and typography routes: a global map plus per-app maps, with the
// caller resolving app-over-global.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_button_theme_settings')
      .select('scope, slot, style');
    if (error) throw error;

    const global: Record<string, string> = {};
    for (const slot of BUTTON_SLOTS) global[slot.key] = 'default';
    const apps: Record<string, Record<string, string>> = {};

    for (const row of data ?? []) {
      if (!isButtonStyle(row.style)) continue;
      if (row.scope === 'global') {
        global[row.slot] = row.style;
      } else {
        apps[row.scope] = { ...apps[row.scope], [row.slot]: row.style };
      }
    }

    return NextResponse.json({ global, apps });
  } catch (error) {
    console.error('button-theme GET error:', error);
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
    const { scope = 'global', slot, style } = body as { scope?: string; slot?: string; style?: string };
    if (scope !== 'global' && !isAppId(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    if (!slot || !BUTTON_SLOTS.some((s) => s.key === slot)) {
      return NextResponse.json({ error: 'Unknown slot' }, { status: 400 });
    }

    const admin = createServiceRoleClient();

    // An app-level row is cleared rather than stored when style is null, so
    // the slot falls back to global again — the per-app "inherit" state.
    if (style === null) {
      if (scope === 'global') {
        return NextResponse.json({ error: 'Global scope cannot inherit' }, { status: 400 });
      }
      const { error } = await admin
        .from('adminlog_button_theme_settings')
        .delete()
        .eq('scope', scope)
        .eq('slot', slot);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (!isButtonStyle(style)) {
      return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
    }

    const { error } = await admin
      .from('adminlog_button_theme_settings')
      .upsert(
        { scope, slot, style, updatedAt: new Date().toISOString() },
        { onConflict: 'scope,slot' }
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('button-theme PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
