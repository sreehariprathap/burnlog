import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';

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
    const supabase = await createClient();
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
        { jobType: 'tasklog-breakdown', app: 'tasklog', model: MODEL },
        { title, description, category },
        async () => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.5,
            messages: [{ role: 'user', content: buildPrompt(title, description || '', category || 'life') }],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: { tasks?: Array<{ title?: string; category?: string; priority?: string; suggestedDueDate?: string | null }> };
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          if (!parsed.tasks || parsed.tasks.length === 0) {
            throw new AiRouteError('AI response contained no tasks', 502);
          }

          const tasks = parsed.tasks
            .filter((t) => t.title && t.title.trim())
            .map((t) => ({
              title: t.title!.trim(),
              category: t.category === 'work' ? 'work' : 'life',
              priority: (['low', 'medium', 'high'].includes(t.priority || '') ? t.priority : 'medium') as 'low' | 'medium' | 'high',
              suggestedDueDate: t.suggestedDueDate && t.suggestedDueDate !== 'null' ? t.suggestedDueDate : null,
            }));

          return { tasks };
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
    console.error('tasklog breakdown error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
