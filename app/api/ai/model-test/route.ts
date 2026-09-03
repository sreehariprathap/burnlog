// app/api/ai/model-test/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { MODEL_TEST_PRESETS, type ModelTestPresetId } from '@/lib/ai/modelTestPresets';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('ai_jobs')
      .select('id, model, input, output, status, error, durationMs, createdAt')
      .eq('jobType', 'model-test')
      .order('createdAt', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ runs: data ?? [] });
  } catch (error) {
    console.error('model-test GET error:', error);
    return NextResponse.json({ error: 'Failed to load test history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, isAdmin')
      .eq('userId', user.id)
      .single();
    if (!profile?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { model, preset } = body as { model?: string; preset?: ModelTestPresetId };

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }
    const presetDef = preset ? MODEL_TEST_PRESETS[preset] : undefined;
    if (!presetDef) {
      return NextResponse.json({ error: 'preset must be one of small, medium, large' }, { status: 400 });
    }
    MODEL = model;

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'model-test', app: 'adminlog', model },
        { preset: presetDef.id },
        async () => {
          const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: presetDef.prompt }],
          });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          const promptTokens = completion.usage?.prompt_tokens ?? null;
          const completionTokens = completion.usage?.completion_tokens ?? null;

          return { text: content, promptTokens, completionTokens };
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
    console.error('model-test POST error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
