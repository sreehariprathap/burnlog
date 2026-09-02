import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
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
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = validateSuggestionsResponse(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('learnlog suggestions error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
