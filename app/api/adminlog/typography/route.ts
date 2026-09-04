// app/api/adminlog/typography/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isHeadingFont, isBodyFont, DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT } from '@/lib/typography';

// Readable by any signed-in user — every page reads this to decide which
// fonts to render, not just adminlog.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data } = await admin
      .from('adminlog_typography_settings')
      .select('headingFont, bodyFont')
      .eq('id', 'global')
      .maybeSingle();

    return NextResponse.json({
      headingFont: isHeadingFont(data?.headingFont) ? data.headingFont : DEFAULT_HEADING_FONT,
      bodyFont: isBodyFont(data?.bodyFont) ? data.bodyFont : DEFAULT_BODY_FONT,
    });
  } catch (error) {
    console.error('typography GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { headingFont, bodyFont } = body as { headingFont?: string; bodyFont?: string };
    if (headingFont !== undefined && !isHeadingFont(headingFont)) {
      return NextResponse.json({ error: 'Invalid headingFont' }, { status: 400 });
    }
    if (bodyFont !== undefined && !isBodyFont(bodyFont)) {
      return NextResponse.json({ error: 'Invalid bodyFont' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const update: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (headingFont !== undefined) update.headingFont = headingFont;
    if (bodyFont !== undefined) update.bodyFont = bodyFont;

    const { error } = await admin
      .from('adminlog_typography_settings')
      .upsert({ id: 'global', ...update }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('typography PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
