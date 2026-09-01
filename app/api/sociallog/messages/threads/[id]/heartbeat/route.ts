import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

// Marks the caller as actively viewing this thread right now — the message
// POST route checks this timestamp to decide whether to also fire a push
// notification for the recipient (skipped if they're already looking at it).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: thread } = await admin
      .from('social_message_threads')
      .select('id, participantAId, participantBId')
      .eq('id', threadId)
      .maybeSingle();
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    if (thread.participantAId !== meId && thread.participantBId !== meId) {
      return NextResponse.json({ error: 'Not a participant in this thread' }, { status: 403 });
    }

    const column = thread.participantAId === meId ? 'participantALastActiveAt' : 'participantBLastActiveAt';
    await admin
      .from('social_message_threads')
      .update({ [column]: new Date().toISOString() })
      .eq('id', threadId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog thread heartbeat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
