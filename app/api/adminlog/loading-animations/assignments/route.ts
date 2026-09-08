// app/api/adminlog/loading-animations/assignments/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { appId, animationId } = (await request.json()) as { appId?: string; animationId?: string | null };
    if (!appId) {
      return NextResponse.json({ error: 'appId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_lottie_assignments')
      .upsert({ appId, animationId: animationId ?? null, updatedByAdminId: caller.id }, { onConflict: 'appId' });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('adminlog loading-animations assignments PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
