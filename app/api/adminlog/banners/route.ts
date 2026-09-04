// app/api/adminlog/banners/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_announcement_banners')
      .select('id, message, url, active, createdAt')
      .order('createdAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ banners: data ?? [] });
  } catch (error) {
    console.error('adminlog banners GET error:', error);
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

    const { message, url } = (await request.json()) as { message?: string; url?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_announcement_banners')
      .insert({ message: message.trim(), url: url?.trim() || null, updatedAt: new Date().toISOString() })
      .select('id, message, url, active, createdAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ banner: data });
  } catch (error) {
    console.error('adminlog banners POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
