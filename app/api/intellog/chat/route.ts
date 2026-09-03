// app/api/intellog/chat/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { assembleProfileContext, type ProfileAppContext } from '@/lib/intellog/chatContext';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { client } from '@/lib/ai/openrouter';

const HISTORY_LIMIT = 20;

function buildSystemPrompt(appContexts: ProfileAppContext[]): string {
  if (appContexts.length === 0) {
    return `You are LogBook's cross-app AI assistant, embedded in the app switcher. This user has no
activity history yet across their apps (BurnLog, MoneyLog, TaskLog, TravelLog, LearnLog, HomeLog,
SocialLog, ShoppingLog) — answer helpfully and generally, and mention that once they log some
activity you'll be able to reference their real data.`;
  }

  const context = appContexts
    .map((ctx) => {
      const lines = Object.entries(ctx.metrics)
        .map(([metric, value]) => {
          const cohort = ctx.cohort[metric];
          const cohortText = cohort ? ` (peers: p25=${cohort.p25}, p50=${cohort.p50}, p75=${cohort.p75})` : '';
          return `  - ${metric}: ${value}${cohortText}`;
        })
        .join('\n');
      return `${ctx.app}:\n${lines}`;
    })
    .join('\n\n');

  return `You are LogBook's cross-app AI assistant, embedded in the app switcher. Answer the user's
questions using their own recent activity metrics below and, where given, anonymized peer
percentiles (never another individual's raw data). Be concise and specific. If asked about
something outside this data, say so rather than guessing.

${context}`;
}

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getOrCreateThread(admin: Admin, profileId: string): Promise<string> {
  const { data: existing } = await admin
    .from('intel_chat_threads')
    .select('id')
    .eq('profileId', profileId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from('intel_chat_threads')
    .insert({ profileId })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

export async function GET() {
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

    const threadId = await getOrCreateThread(admin, profileId);
    const { data: messages, error } = await admin
      .from('intel_chat_messages')
      .select('id, role, content, createdAt')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ messages: messages ?? [] });
  } catch (error) {
    console.error('intellog chat GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { message } = body as { message?: string };
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const threadId = await getOrCreateThread(admin, profileId);

    const { error: insertUserError } = await admin
      .from('intel_chat_messages')
      .insert({ threadId, role: 'user', content: message.trim() });
    if (insertUserError) throw insertUserError;

    const { data: historyRows, error: historyError } = await admin
      .from('intel_chat_messages')
      .select('role, content')
      .eq('threadId', threadId)
      .order('createdAt', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) throw historyError;

    const history = ((historyRows ?? []) as { role: string; content: string }[]).reverse();

    const model = await getModel(admin, 'intellog-chat');
    const { appContexts } = await assembleProfileContext(admin, profileId);
    const systemPrompt = buildSystemPrompt(appContexts);

    try {
      const reply = await runAiJob(
        admin,
        profileId,
        { jobType: 'intellog-chat', app: 'intellog', model },
        { message },
        async () => {
          const completion = await client.chat.completions.create({
            model,
            temperature: 0.4,
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            ],
          });
          const content = completion.choices?.[0]?.message?.content;
          if (!content) throw new AiRouteError('AI returned no response', 502);
          return content;
        }
      );

      const { data: assistantMessage, error: insertAssistantError } = await admin
        .from('intel_chat_messages')
        .insert({ threadId, role: 'assistant', content: reply })
        .select('id, role, content, createdAt')
        .single();
      if (insertAssistantError) throw insertAssistantError;

      return NextResponse.json({ message: assistantMessage });
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('intellog chat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
