// app/api/intellog/chat/threads/[threadId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: thread } = await admin
      .from('intel_chat_threads')
      .select('id, profileId')
      .eq('id', threadId)
      .maybeSingle();
    if (!thread || thread.profileId !== profileId) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const { error } = await admin.from('intel_chat_threads').delete().eq('id', threadId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('intellog chat thread DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
