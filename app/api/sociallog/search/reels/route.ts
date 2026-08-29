import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from('social_posts')
      .select('id, mediaType, mediaUrl, mediaThumbnailUrl, body, createdAt, profile:profiles(id, username, firstName, avatarUrl)')
      .eq('kind', 'MEDIA')
      .order('createdAt', { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      id: string;
      mediaType: string | null;
      mediaUrl: string | null;
      mediaThumbnailUrl: string | null;
      body: string | null;
      createdAt: string;
      profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    const reels = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.profile !== null && r.mediaUrl !== null)
      .map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        mediaUrl: r.mediaUrl,
        mediaThumbnailUrl: r.mediaThumbnailUrl,
        body: r.body,
        createdAt: r.createdAt,
        author: r.profile,
      }));

    return NextResponse.json({ reels });
  } catch (error) {
    console.error('sociallog search reels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
