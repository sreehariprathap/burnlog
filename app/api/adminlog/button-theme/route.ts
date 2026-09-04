// app/api/adminlog/button-theme/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { BUTTON_SLOTS, isButtonStyle } from '@/lib/buttonThemes';

// Readable by any signed-in user — every app reads this to decide how its
// themed buttons should render, not just adminlog.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('adminlog_button_theme_settings').select('slot, style');
    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const slot of BUTTON_SLOTS) settings[slot.key] = 'default';
    for (const row of data ?? []) {
      if (isButtonStyle(row.style)) settings[row.slot] = row.style;
    }

    return NextResponse.json({ settings });
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
    const { slot, style } = body as { slot?: string; style?: string };
    if (!slot || !BUTTON_SLOTS.some((s) => s.key === slot)) {
      return NextResponse.json({ error: 'Unknown slot' }, { status: 400 });
    }
    if (!isButtonStyle(style)) {
      return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_button_theme_settings')
      .upsert({ slot, style, updatedAt: new Date().toISOString() }, { onConflict: 'slot' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('button-theme PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
