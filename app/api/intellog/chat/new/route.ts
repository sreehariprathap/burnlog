// app/api/intellog/chat/new/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { assembleProfileContext } from '@/lib/intellog/chatContext';
import { buildSystemPrompt, generateChatReply, type ChatHistoryMessage } from '@/lib/intellog/chatSend';
import { truncateTitle } from '@/lib/intellog/chatThreads';
import { getModel } from '@/lib/ai/modelConfig';
import { AiRouteError } from '@/lib/ai/jobs';

export async function POST(request: Request) {
  try {
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

    const body = await request.json();
    const { message, model } = body as { message?: string; model?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const trimmedMessage = message.trim();

    const { data: thread, error: threadError } = await admin
      .from('intel_chat_threads')
      .insert({ profileId, title: truncateTitle(trimmedMessage), modelId: model ?? null })
      .select('id')
      .single();
    if (threadError) throw threadError;
    const threadId = thread.id as string;

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: trimmedMessage });
    if (insertUserError) throw insertUserError;

    const effectiveModel = model ?? (await getModel(admin, 'intellog-chat'));
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);
    const history: ChatHistoryMessage[] = [{ role: 'user', content: trimmedMessage }];

    try {
      const reply = await generateChatReply(admin, profileId, systemPrompt, history, effectiveModel);

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      await admin.from('intel_chat_threads').update({ updatedAt: new Date().toISOString() }).eq('id', threadId);

      return NextResponse.json({ threadId, message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message, threadId }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat new POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
