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

function buildPrompt(title: string, notes: string, category: string): string {
  return `You are a productivity coach turning a raw idea into an actionable short plan.

Idea title: ${title}
Idea notes: ${notes || 'None provided'}
Idea category: ${category}

Write a short plan (2-4 sentences) describing a sensible approach to move this idea forward, then generate 4 to 8 concrete tasks that would make meaningful progress on it. Each task should be a single, specific action (not vague), with a one-to-two sentence description explaining what doing it actually involves.

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"plan": "...", "tasks": [{"title": "...", "description": "...", "category": "life or work", "priority": "low, medium, or high", "suggestedDueDate": "YYYY-MM-DD or null"}]}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, notes, category } = (await request.json()) as {
      title?: string;
      notes?: string | null;
      category?: string;
    };
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Missing idea title' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'tasklog-idea-breakdown');

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
        { jobType: 'tasklog-idea-breakdown', app: 'tasklog', model: MODEL },
        { title, notes, category },
        async () => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.5,
            messages: [{ role: 'user', content: buildPrompt(title, notes || '', category || 'idea') }],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: {
            plan?: string;
            tasks?: Array<{ title?: string; description?: string; category?: string; priority?: string; suggestedDueDate?: string | null }>;
          };
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          if (!parsed.plan || !parsed.tasks || parsed.tasks.length === 0) {
            throw new AiRouteError('AI response was missing a plan or tasks', 502);
          }

          const tasks = parsed.tasks
            .filter((t) => t.title && t.title.trim())
            .map((t) => ({
              title: t.title!.trim(),
              description: t.description?.trim() || '',
              category: t.category === 'work' ? 'work' : 'life',
              priority: (['low', 'medium', 'high'].includes(t.priority || '') ? t.priority : 'medium') as 'low' | 'medium' | 'high',
              suggestedDueDate: t.suggestedDueDate && t.suggestedDueDate !== 'null' ? t.suggestedDueDate : null,
            }));

          return { plan: parsed.plan.trim(), tasks };
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
    console.error('tasklog idea-breakdown error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
