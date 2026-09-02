import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
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

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: buildOnboardingSystemPrompt() },
        { role: 'user', content: buildOnboardingUserPrompt(req) },
      ],
      response_format: { type: 'json_object' },
    });

    if (!completion.choices || completion.choices.length === 0) {
      const providerError = (completion as unknown as { error?: { message?: string } }).error;
      throw new Error(providerError?.message || 'AI provider returned no response choices');
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = validateOnboardingResponse(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('learnlog onboarding error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
