import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
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

    const { data: threadRows, error } = await admin
      .from('social_message_threads')
      .select('id, participantAId, participantBId, lastMessageAt, participantA:profiles!social_message_threads_participantAId_fkey(id, username, firstName, avatarUrl), participantB:profiles!social_message_threads_participantBId_fkey(id, username, firstName, avatarUrl)')
      .or(`participantAId.eq.${meId},participantBId.eq.${meId}`)
      .order('lastMessageAt', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type ThreadRow = {
      id: string;
      participantAId: string;
      participantBId: string;
      lastMessageAt: string;
      participantA: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
      participantB: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    const rows = (threadRows ?? []) as unknown as ThreadRow[];
    const threadIds = rows.map((t) => t.id);

    const { data: lastMessages } = await admin
      .from('social_messages')
      .select('threadId, body, senderId, createdAt')
      .in('threadId', threadIds.length ? threadIds : ['00000000-0000-0000-0000-000000000000'])
      .order('createdAt', { ascending: false });

    const lastMessageByThread = new Map<string, { body: string; senderId: string }>();
    for (const m of lastMessages ?? []) {
      if (!lastMessageByThread.has(m.threadId)) {
        lastMessageByThread.set(m.threadId, { body: m.body, senderId: m.senderId });
      }
    }

    const threads = rows
      .filter((t) => t.participantA !== null && t.participantB !== null)
      .map((t) => {
        const otherParticipant = t.participantAId === meId ? t.participantB! : t.participantA!;
        const last = lastMessageByThread.get(t.id);
        return {
          id: t.id,
          otherParticipant,
          lastMessageAt: t.lastMessageAt,
          lastMessageBody: last?.body ?? null,
          lastMessageSenderId: last?.senderId ?? null,
        };
      });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('sociallog threads GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { targetProfileId } = body as { targetProfileId?: string };
    if (!targetProfileId) {
      return NextResponse.json({ error: 'targetProfileId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (meId === targetProfileId) {
      return NextResponse.json({ error: "You can't message yourself" }, { status: 400 });
    }

    const { data: targetSettings } = await admin
      .from('social_profile_settings')
      .select('whoCanMessage')
      .eq('profileId', targetProfileId)
      .maybeSingle();
    const whoCanMessage = targetSettings?.whoCanMessage ?? 'everyone';

    if (whoCanMessage === 'none') {
      return NextResponse.json({ error: 'This user is not accepting messages' }, { status: 403 });
    }
    if (whoCanMessage === 'followers') {
      const { data: followsMe } = await admin
        .from('social_follows')
        .select('id')
        .eq('followerId', targetProfileId)
        .eq('followingId', meId)
        .maybeSingle();
      if (!followsMe) {
        return NextResponse.json({ error: 'This user only accepts messages from followers' }, { status: 403 });
      }
    }

    const [participantAId, participantBId] = [meId, targetProfileId].sort();

    const { data: existing } = await admin
      .from('social_message_threads')
      .select('id')
      .eq('participantAId', participantAId)
      .eq('participantBId', participantBId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ id: existing.id });
    }

    const { data: created, error } = await admin
      .from('social_message_threads')
      .insert({ participantAId, participantBId })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: created.id });
  } catch (error) {
    console.error('sociallog threads POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
