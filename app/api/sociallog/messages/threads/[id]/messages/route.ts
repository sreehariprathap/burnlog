import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
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
    const supabase = createRouteHandlerClient({ cookies });
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
    if (!(await assertParticipant(admin, threadId, meId))) {
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

    return NextResponse.json(created);
  } catch (error) {
    console.error('sociallog thread messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
