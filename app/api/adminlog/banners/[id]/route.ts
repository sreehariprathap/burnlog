// app/api/adminlog/banners/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json()) as { message?: string; url?: string | null; active?: boolean };
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.message !== undefined) update.message = body.message;
    if (body.url !== undefined) update.url = body.url;
    if (body.active !== undefined) update.active = body.active;

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_announcement_banners')
      .update(update)
      .eq('id', id)
      .select('id, message, url, active, createdAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ banner: data });
  } catch (error) {
    console.error('adminlog banner PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.from('adminlog_announcement_banners').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('adminlog banner DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
