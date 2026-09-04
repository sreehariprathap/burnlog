// app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Any signed-in user reads the active banners — this is the public
// (read-only) side; AdminLog > General > Banners does the CRUD.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_announcement_banners')
      .select('id, message, url')
      .eq('active', true)
      .order('createdAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ banners: data ?? [] });
  } catch (error) {
    console.error('announcements GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
