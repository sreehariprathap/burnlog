// app/api/adminlog/loading-animations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const admin = createServiceRoleClient();

    const { data: row, error: fetchError } = await admin
      .from('adminlog_lottie_animations')
      .select('isReadOnly')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.isReadOnly) {
      return NextResponse.json({ error: 'Built-in animations cannot be deleted' }, { status: 400 });
    }

    const { error } = await admin.from('adminlog_lottie_animations').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('adminlog loading-animations DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
