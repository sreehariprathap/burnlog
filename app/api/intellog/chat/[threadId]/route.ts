// app/api/intellog/chat/[threadId]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { assembleProfileContext } from '@/lib/intellog/chatContext';
import { buildSystemPrompt, generateChatReply, type ChatHistoryMessage } from '@/lib/intellog/chatSend';
import { getModel } from '@/lib/ai/modelConfig';
import { AiRouteError } from '@/lib/ai/jobs';

const HISTORY_LIMIT = 20;

type Admin = ReturnType<typeof createServiceRoleClient>;

async function loadOwnedThread(admin: Admin, threadId: string, profileId: string) {
  const { data } = await admin
    .from('intel_chat_threads')
    .select('id, title, modelId, profileId')
    .eq('id', threadId)
    .maybeSingle();
  if (!data || data.profileId !== profileId) return null;
  const { profileId: _discard, ...thread } = data;
  return thread;
}

export async function GET(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
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

    const thread = await loadOwnedThread(admin, threadId, profileId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const { data: messages, error } = await admin
      .from('intel_chat_messages')
      .select('id, role, content, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ thread, messages: messages ?? [] });
  } catch (error) {
    console.error('intellog chat thread GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
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

    const thread = await loadOwnedThread(admin, threadId, profileId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const body = await request.json();
    const { message, model } = body as { message?: string; model?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const trimmedMessage = message.trim();

    if (model && model !== thread.modelId) {
      await admin.from('intel_chat_threads').update({ modelId: model }).eq('id', threadId);
    }

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: trimmedMessage });
    if (insertUserError) throw insertUserError;

    const { data: historyRows, error: historyError } = await admin
      .from('intel_chat_messages')
      .select('role, content')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) throw historyError;
    const history = ((historyRows ?? []) as ChatHistoryMessage[]).reverse();

    const effectiveModel = model ?? thread.modelId ?? (await getModel(admin, 'intellog-chat'));
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);

    try {
      const reply = await generateChatReply(admin, profileId, systemPrompt, history, effectiveModel);

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      await admin.from('intel_chat_threads').update({ updatedAt: new Date().toISOString() }).eq('id', threadId);

      return NextResponse.json({ message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat thread POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
