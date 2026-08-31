import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const VALID_CATEGORIES = ['life', 'work'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    MODEL = await getModel(supabase, 'text');

    const body = await request.json();
    const { title } = body as { title?: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const prompt = `You are triaging a personal task list.

Task title: "${title.trim()}"

Classify this task.
- category: "life" for personal/household/health/social tasks, "work" for job/career/business tasks.
- priority: "low", "medium", or "high" based on how urgent/important the title implies it is.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "category": "life" | "work",
  "priority": "low" | "medium" | "high"
}`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const result = parsed as Record<string, unknown>;
    const category = result.category as string;
    const priority = result.priority as string;

    if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json({ error: 'AI response had an invalid category' }, { status: 502 });
    }
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return NextResponse.json({ error: 'AI response had an invalid priority' }, { status: 502 });
    }

    return NextResponse.json({ category, priority });
  } catch (error) {
    console.error('categorize-task error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
