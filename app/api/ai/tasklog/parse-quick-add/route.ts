import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { todayDateString } from '@/lib/tasklog/types';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function buildPrompt(text: string): string {
  return `Today's date is ${todayDateString()} (YYYY-MM-DD). Extract a task from this quick-capture note: "${text}"

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"title": "short task title with date/priority words removed", "dueDate": "YYYY-MM-DD or null if no date mentioned", "priority": "low, medium, or high — default medium if not mentioned"}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { text } = (await request.json()) as { text?: string };
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [{ role: 'user', content: buildPrompt(text) }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { title?: string; dueDate?: string | null; priority?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    const priority = ['low', 'medium', 'high'].includes(parsed.priority || '') ? parsed.priority : 'medium';

    return NextResponse.json({
      title: parsed.title?.trim() || text.trim(),
      dueDate: parsed.dueDate && parsed.dueDate !== 'null' ? parsed.dueDate : null,
      priority,
    });
  } catch (error) {
    console.error('tasklog parse-quick-add error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
