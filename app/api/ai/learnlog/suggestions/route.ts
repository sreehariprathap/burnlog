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
  type ClassSuggestionsRequest,
} from '@/lib/learnlog/suggestions';

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

    const body = (await request.json()) as Partial<ClassSuggestionsRequest>;
    if (!body.skillName || !body.city) {
      return NextResponse.json({ error: 'Missing required suggestion inputs' }, { status: 400 });
    }

    const req: ClassSuggestionsRequest = {
      skillName: body.skillName,
      skillCategory: body.skillCategory ?? null,
      city: body.city,
      budgetHint: body.budgetHint ?? null,
      upcomingDestination: body.upcomingDestination ?? null,
    };

    MODEL = await getModel(supabase, 'text');

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
        { jobType: 'learnlog-suggestions', app: 'learnlog', model: MODEL },
        req,
        async () => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.6,
            messages: [
              { role: 'system', content: buildSuggestionsSystemPrompt() },
              { role: 'user', content: buildSuggestionsUserPrompt(req) },
            ],
            response_format: { type: 'json_object' },
          });

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

          return validateSuggestionsResponse(parsed);
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
    console.error('learnlog suggestions error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
