// app/api/loading-animations/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Public read — SwitchLoader fetches the resolved per-app animation source
// on every page, including logged-out ones like /login. AdminLog > Loading
// Animations does the CRUD, at /api/adminlog/loading-animations.
export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_lottie_assignments')
      .select('appId, animationId, adminlog_lottie_animations(id, kind, filePath)');
    if (error) throw error;

    const animations: Record<string, { src: string; kind: 'lottie' } | { src: null; kind: 'siri_orb' } | null> = {};
    for (const row of data ?? []) {
      // Supabase's select-string type inference can't see this repo's schema
      // (no generated Database types), so it defaults the nested resource to
      // an array; at runtime PostgREST returns a single object (or null)
      // here since animationId is a to-one FK from this row's perspective.
      const anim = row.adminlog_lottie_animations as unknown as { id: string; kind: string; filePath: string | null } | null;
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
