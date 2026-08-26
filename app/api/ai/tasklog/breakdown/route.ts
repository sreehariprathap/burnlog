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

function buildPrompt(title: string, description: string, category: string): string {
  return `You are a productivity coach breaking a goal into concrete, actionable tasks.

Goal title: ${title}
Goal description: ${description || 'None provided'}
Goal category: ${category}

Generate 4 to 8 concrete tasks that would make meaningful progress on this goal. Each task should be a single, specific action (not vague).

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"tasks": [{"title": "...", "category": "life or work", "priority": "low, medium, or high", "suggestedDueDate": "YYYY-MM-DD or null"}]}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, description, category } = (await request.json()) as {
      title?: string;
      description?: string | null;
      category?: string;
    };
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Missing goal title' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [{ role: 'user', content: buildPrompt(title, description || '', category || 'life') }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { tasks?: Array<{ title?: string; category?: string; priority?: string; suggestedDueDate?: string | null }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.tasks || parsed.tasks.length === 0) {
      return NextResponse.json({ error: 'AI response contained no tasks' }, { status: 502 });
    }

    const tasks = parsed.tasks
      .filter((t) => t.title && t.title.trim())
      .map((t) => ({
        title: t.title!.trim(),
        category: t.category === 'work' ? 'work' : 'life',
        priority: (['low', 'medium', 'high'].includes(t.priority || '') ? t.priority : 'medium') as 'low' | 'medium' | 'high',
        suggestedDueDate: t.suggestedDueDate && t.suggestedDueDate !== 'null' ? t.suggestedDueDate : null,
      }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('tasklog breakdown error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
