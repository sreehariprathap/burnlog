import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { APPS, type AppId } from '@/lib/appMode';
import { validateHabitClassification } from '@/lib/ai/validateHabitClassification';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    MODEL = await getModel(supabase, 'classify-habit');

    const body = await request.json();
    const { text } = body as { text?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const appRoster = (Object.keys(APPS) as AppId[])
      .filter((id) => id !== 'logbook' && id !== 'adminlog')
      .map((id) => `- ${id}: ${APPS[id].tagline}`)
      .join('\n');

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'classify-habit', app: 'logbook', model: MODEL },
        { text },
        async (signal) => {
          const prompt = `A user wants to build a habit and described it in their own words.

Habit description: "${text.trim()}"

Available apps this habit could belong to:
${appRoster}

Task:
1. Write a short, clean "title" for this habit (a few words).
2. Pick the single best-fitting "sourceApp" id from the list above, or null if none clearly fits.
3. Decide "isRecurring": true if the description implies a repeated habit (e.g. "every day", "each morning"), false if it sounds one-time.
4. If recurring, optionally suggest "suggestedRecurrence": { "daysOfWeek": number[] (0=Sun..6=Sat), "intervalWeeks": number }. Omit fields you're not confident about.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "title": string,
  "sourceApp": string | null,
  "isRecurring": boolean,
  "suggestedRecurrence"?: { "daysOfWeek"?: number[], "intervalWeeks"?: number }
}`;

          const completion = await client.chat.completions.create(
            {
              model: MODEL,
              temperature: 0.2,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
            },
            { signal }
          );

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          try {
            return validateHabitClassification(parsed, Object.keys(APPS));
          } catch (err) {
            throw new AiRouteError(err instanceof Error ? err.message : 'AI response was invalid', 502);
          }
        }
      );

      return NextResponse.json(responsePayload);
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('classify-habit error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
