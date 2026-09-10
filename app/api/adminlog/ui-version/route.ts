import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

// Public read — every page needs to resolve this before first paint, same
// as app-theme.
export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('adminlog_ui_version_settings').select('id, enabled');
    if (error) throw error;

    const rows = (data ?? []) as { id: string; enabled: boolean }[];
    const global = rows.find((r) => r.id === 'global');
    return NextResponse.json({ enabled: global?.enabled ?? false });
  } catch (error) {
    console.error('ui-version GET error:', error);
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
    const { enabled } = body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_ui_version_settings')
      .upsert({ id: 'global', enabled, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('ui-version PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
