import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

type Admin = ReturnType<typeof createServiceRoleClient>;

type Participant = { id: string; userId: string; username: string; firstName: string } | null;

type ThreadWithParticipants = {
  id: string;
  participantAId: string;
  participantBId: string;
  participantALastActiveAt: string | null;
  participantBLastActiveAt: string | null;
  participantA: Participant;
  participantB: Participant;
};

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function assertParticipant(admin: Admin, threadId: string, meId: string) {
  const { data: thread } = await admin
    .from('social_message_threads')
    .select('id, participantAId, participantBId')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return false;
  return thread.participantAId === meId || thread.participantBId === meId;
}

async function getThreadWithParticipants(admin: Admin, threadId: string) {
  const { data } = await admin
    .from('social_message_threads')
    .select(
      'id, participantAId, participantBId, participantALastActiveAt, participantBLastActiveAt, ' +
        'participantA:profiles!social_message_threads_participantAId_fkey(id, userId, username, firstName), ' +
        'participantB:profiles!social_message_threads_participantBId_fkey(id, userId, username, firstName)'
    )
    .eq('id', threadId)
    .maybeSingle();
  return (data as unknown as ThreadWithParticipants) ?? null;
}

// A recipient's heartbeat this recent means they're actively looking at the
// thread right now — skip the push so we don't double-notify them.
const ACTIVE_VIEW_WINDOW_MS = 20_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (!(await assertParticipant(admin, threadId, meId))) {
      return NextResponse.json({ error: 'Not a participant in this thread' }, { status: 403 });
    }

    const { data: rows, error } = await admin
      .from('social_messages')
      .select('id, body, senderId, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ messages: rows ?? [] });
  } catch (error) {
    console.error('sociallog thread messages GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { body: text } = body as { body?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const thread = await getThreadWithParticipants(admin, threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    if (thread.participantAId !== meId && thread.participantBId !== meId) {
      return NextResponse.json({ error: 'Not a participant in this thread' }, { status: 403 });
    }

    const { data: created, error } = await admin
      .from('social_messages')
      .insert({ threadId, senderId: meId, body: text.trim() })
      .select('id, body, senderId, createdAt')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await admin.from('social_message_threads').update({ lastMessageAt: created.createdAt }).eq('id', threadId);

    const iAmA = thread.participantAId === meId;
    const sender = iAmA ? thread.participantA : thread.participantB;
    const recipient = iAmA ? thread.participantB : thread.participantA;
    const recipientLastActiveAt = iAmA ? thread.participantBLastActiveAt : thread.participantALastActiveAt;
    const recipientIsActive =
      recipientLastActiveAt != null && Date.now() - new Date(recipientLastActiveAt).getTime() < ACTIVE_VIEW_WINDOW_MS;

    if (recipient && !recipientIsActive) {
      try {
        await sendPushToUser(admin, recipient.userId, {
          title: sender?.firstName || sender?.username ? `${sender?.firstName || sender?.username}` : 'New message',
          message: text.trim().slice(0, 140),
          url: `/sociallog/messages/${threadId}`,
        });
      } catch (pushError) {
        console.error('sociallog message push send failed:', pushError);
      }
    }

    return NextResponse.json(created);
  } catch (error) {
    console.error('sociallog thread messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
