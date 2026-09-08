// app/api/adminlog/loading-animations/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

const MAX_ANIMATION_BYTES = 2 * 1024 * 1024;

function toSummary(row: { id: string; name: string; kind: string; isReadOnly: boolean; filePath: string | null; data: unknown }) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as 'lottie' | 'siri_orb',
    isReadOnly: row.isReadOnly,
    filePath: row.filePath,
    hasData: row.data != null,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const [{ data: animRows, error: animError }, { data: assignRows, error: assignError }] = await Promise.all([
      admin.from('adminlog_lottie_animations').select('id, name, kind, isReadOnly, filePath, data'),
      admin.from('adminlog_lottie_assignments').select('appId, animationId'),
    ]);
    if (animError) throw animError;
    if (assignError) throw assignError;

    const assignments: Record<string, string | null> = {};
    for (const row of assignRows ?? []) {
      assignments[row.appId] = row.animationId;
    }

    return NextResponse.json({
      animations: (animRows ?? []).map(toSummary),
      assignments,
    });
  } catch (error) {
    console.error('adminlog loading-animations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { name, data } = (await request.json()) as { name?: string; data?: unknown };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data) || !Array.isArray((data as Record<string, unknown>).layers)) {
      return NextResponse.json({ error: 'data must be a Lottie animation object with a "layers" array' }, { status: 400 });
    }
    const size = JSON.stringify(data).length;
    if (size > MAX_ANIMATION_BYTES) {
      return NextResponse.json({ error: `Animation is too large (${(size / 1024 / 1024).toFixed(1)}MB, max 2MB)` }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: row, error } = await admin
      .from('adminlog_lottie_animations')
      .insert({ name: name.trim(), kind: 'lottie', isReadOnly: false, data, createdByAdminId: caller.id })
      .select('id, name, kind, isReadOnly, filePath, data')
      .single();
    if (error) throw error;

    return NextResponse.json({ animation: toSummary(row) });
  } catch (error) {
    console.error('adminlog loading-animations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
