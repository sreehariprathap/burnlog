// app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Public read — the banner is shown on every page, including logged-out
// ones like /login; AdminLog > General > Banners does the CRUD.
export async function GET() {
  try {
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
