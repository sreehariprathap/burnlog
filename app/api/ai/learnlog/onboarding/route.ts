import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import {
  buildOnboardingSystemPrompt,
  buildOnboardingUserPrompt,
  validateOnboardingResponse,
  type OnboardingRequest,
} from '@/lib/learnlog/onboarding';

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

    const body = (await request.json()) as Partial<OnboardingRequest>;
    if (!body.interests || !body.readingGoals || !body.careerFocus) {
      return NextResponse.json({ error: 'Missing required onboarding inputs' }, { status: 400 });
    }

    const req: OnboardingRequest = {
      interests: body.interests,
      readingGoals: body.readingGoals,
      careerFocus: body.careerFocus,
    };

    MODEL = await getModel(supabase, 'learnlog-onboarding');

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
        { jobType: 'learnlog-onboarding', app: 'learnlog', model: MODEL },
        req,
        async (signal) => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.6,
            messages: [
              { role: 'system', content: buildOnboardingSystemPrompt() },
              { role: 'user', content: buildOnboardingUserPrompt(req) },
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

          return validateOnboardingResponse(parsed);
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
    console.error('learnlog onboarding error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
