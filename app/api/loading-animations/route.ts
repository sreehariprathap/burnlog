// app/api/loading-animations/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Any signed-in user reads the resolved per-app animation source — this is
// what SwitchLoader fetches on every app-switch. AdminLog > Loading
// Animations does the CRUD, at /api/adminlog/loading-animations.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_lottie_assignments')
      .select('appId, animationId, adminlog_lottie_animations(id, kind, filePath)');
    if (error) throw error;

    const animations: Record<string, { src: string; kind: 'lottie' } | { src: null; kind: 'siri_orb' } | null> = {};
    for (const row of data ?? []) {
      const anim = row.adminlog_lottie_animations as { id: string; kind: string; filePath: string | null } | null;
      if (!anim) {
        animations[row.appId] = null;
        continue;
      }
      if (anim.kind === 'siri_orb') {
        animations[row.appId] = { src: null, kind: 'siri_orb' };
      } else {
        animations[row.appId] = {
          src: anim.filePath ?? `/api/loading-animations/${anim.id}`,
          kind: 'lottie',
        };
      }
    }

    return NextResponse.json({ animations });
  } catch (error) {
    console.error('loading-animations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
