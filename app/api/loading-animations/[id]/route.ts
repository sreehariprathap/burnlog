// app/api/loading-animations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Raw JSON for a DB-stored (custom) animation, used as the fetch target for
// lottie-react's `src` in place of a static /lottie/*.json path. File-backed
// built-ins never hit this route — they're fetched from their static path
// directly, which is why this 404s when `data` is null (a siri_orb row, or
// a row that somehow has neither filePath nor data).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createServiceRoleClient();
    const { data: row, error } = await admin
      .from('adminlog_lottie_animations')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!row?.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(row.data);
  } catch (error) {
    console.error('loading-animations/[id] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
