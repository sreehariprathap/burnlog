import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import {
  buildSuggestionsSystemPrompt,
  buildSuggestionsUserPrompt,
  validateSuggestionsResponse,
  type SuggestionsRequest,
} from '@/lib/travellog/suggestions';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<SuggestionsRequest>;
    if (!body.freeWindows || body.freeWindows.length === 0 || !body.country || !body.currency) {
      return NextResponse.json({ error: 'Missing required suggestion inputs' }, { status: 400 });
    }

    const req: SuggestionsRequest = {
      freeWindows: body.freeWindows,
      averageMonthlySurplus: body.averageMonthlySurplus ?? 0,
      currency: body.currency,
      country: body.country,
      holidays: body.holidays ?? [],
    };

    MODEL = await getModel(supabase, 'travellog-suggestions');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('userId', user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'travellog-suggestions', app: 'travellog', model: MODEL },
        req,
        async (signal) => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.6,
            messages: [
              { role: 'system', content: buildSuggestionsSystemPrompt() },
              { role: 'user', content: buildSuggestionsUserPrompt(req) },
            ],
            response_format: { type: 'json_object' },
          }, { signal });

          if (!completion.choices || completion.choices.length === 0) {
            const providerError = (completion as unknown as { error?: { message?: string } }).error;
            throw new Error(providerError?.message || 'AI provider returned no response choices');
          }

          const content = completion.choices[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          return validateSuggestionsResponse(parsed, req.freeWindows);
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
    console.error('travellog suggestions error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
