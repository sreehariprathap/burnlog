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

function buildPrompt(householdName: string): string {
  return `You are helping a household get started with chore tracking.

Household name: ${householdName}

Suggest 5 to 8 common recurring household chores spanning cleaning, maintenance, and other categories. Each chore should be concrete and commonly needed (e.g. "Take out trash", "Clean bathroom", "Vacuum living room", "Change air filter", "Water plants").

Respond with ONLY a JSON object, no markdown, in this exact shape:
{"chores": [{"title": "...", "category": "cleaning, maintenance, or other", "frequency": "weekly, monthly, or yearly", "dayOfWeek": 0-6 or null}]}

dayOfWeek should only be set for weekly chores (0=Sunday..6=Saturday), null otherwise.`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { householdName } = (await request.json()) as { householdName?: string };
    if (!householdName || !householdName.trim()) {
      return NextResponse.json({ error: 'Missing household name' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'suggest-chores');

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
        { jobType: 'suggest-chores', app: 'homelog', model: MODEL },
        { householdName },
        async (signal) => {
          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.5,
            messages: [{ role: 'user', content: buildPrompt(householdName) }],
            response_format: { type: 'json_object' },
          }, { signal });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: { chores?: Array<{ title?: string; category?: string; frequency?: string; dayOfWeek?: number | null }> };
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          if (!parsed.chores || parsed.chores.length === 0) {
            throw new AiRouteError('AI response contained no chores', 502);
          }

          const chores = parsed.chores
            .filter((c) => c.title && c.title.trim())
            .map((c) => {
              const frequency = (['weekly', 'monthly', 'yearly'].includes(c.frequency || '') ? c.frequency : 'weekly') as
                | 'weekly'
                | 'monthly'
                | 'yearly';
              return {
                title: c.title!.trim(),
                category: (['cleaning', 'maintenance', 'other'].includes(c.category || '') ? c.category : 'other') as
                  | 'cleaning'
                  | 'maintenance'
                  | 'other',
                frequency,
                dayOfWeek: frequency === 'weekly' && typeof c.dayOfWeek === 'number' ? c.dayOfWeek : null,
              };
            });

          return { chores };
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
    console.error('homelog suggest-chores error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
