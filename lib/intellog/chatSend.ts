// lib/intellog/chatSend.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import type { ProfileAppContext } from './chatContext';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(appContexts: ProfileAppContext[]): string {
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

/**
 * Calls the given model with the system prompt + conversation history, logging
 * the call as an ai_jobs row via runAiJob. Throws AiRouteError (with a status
 * code) on any failure — callers map that back to an HTTP response.
 */
export async function generateChatReply(
  admin: SupabaseClient,
  profileId: string,
  systemPrompt: string,
  history: ChatHistoryMessage[],
  model: string
): Promise<string> {
  // Imported lazily so pure functions in this module (buildSystemPrompt) can be
  // unit-tested without constructing the OpenAI client, which requires
  // NEXT_OPENROUTER_KEY to be set in the environment.
  const { client } = await import('@/lib/ai/openrouter');
  return runAiJob(
    admin,
    profileId,
    { jobType: 'intellog-chat', app: 'intellog', model },
    { message: history[history.length - 1]?.content },
    async () => {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
      });
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new AiRouteError('AI returned no response', 502);
      return content;
    }
  );
}
