// lib/intellog/chatSend.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import type { ProfileAppContext } from './chatContext';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STYLE_RULES = `Style rules:
- Be concise and direct. Answer the actual question first — no greeting, no restating the
  question, no padding, no disclaimers, no "here's a quick rundown" preamble.
- If the request is ambiguous or missing something you'd need to answer well, ask ONE short
  clarifying question instead of guessing or answering every possible interpretation.
- Use markdown sparingly: short paragraphs and a bullet list only when it genuinely helps.
  Do not use tables, headers, or emoji for short answers.
- End your reply with a line in exactly this form, on its own line:
  Suggestions: <question 1> | <question 2> | <question 3>
  Give 2-3 short (under 8 words), specific follow-up questions the user might ask next, each
  separated by "|". Omit this line entirely if there's nothing useful to suggest — e.g. you
  just asked a clarifying question, or the conversation is naturally over.`;

export function buildSystemPrompt(appContexts: ProfileAppContext[]): string {
  if (appContexts.length === 0) {
    return `You are LogBook's cross-app AI assistant, embedded in the app switcher. This user has no
activity history yet across their apps (BurnLog, MoneyLog, TaskLog, TravelLog, LearnLog, HomeLog,
SocialLog, ShoppingLog) — answer helpfully and generally, and mention that once they log some
activity you'll be able to reference their real data.

${STYLE_RULES}`;
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
percentiles (never another individual's raw data). If asked about something outside this data,
say so rather than guessing.

${context}

${STYLE_RULES}`;
}

const MAX_SUGGESTIONS = 4;
const SUGGESTIONS_LINE_RE = /^suggestions:\s*(.*)$/im;

/**
 * Splits a raw model reply into its display text and the follow-up
 * suggestions it may have appended via the "Suggestions: a | b | c"
 * convention from the system prompt. Tolerant of the model omitting the
 * line entirely (custom/free models aren't guaranteed to follow it) — in
 * that case the whole trimmed reply is returned with an empty suggestions
 * list, never an error.
 */
export function parseSuggestions(raw: string): { reply: string; suggestions: string[] } {
  const match = raw.match(SUGGESTIONS_LINE_RE);
  if (!match) {
    return { reply: raw.trim(), suggestions: [] };
  }

  const suggestions = match[1]
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);

  const reply = raw.slice(0, match.index).trim();
  return { reply, suggestions };
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
): Promise<{ reply: string; suggestions: string[] }> {
  // Imported lazily so pure functions in this module (buildSystemPrompt) can be
  // unit-tested without constructing the OpenAI client, which requires
  // NEXT_OPENROUTER_KEY to be set in the environment.
  const { client } = await import('@/lib/ai/openrouter');
  const content = await runAiJob(
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
      const responseContent = completion.choices?.[0]?.message?.content;
      if (!responseContent) throw new AiRouteError('AI returned no response', 502);
      return responseContent;
    }
  );
  return parseSuggestions(content);
}
