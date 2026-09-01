import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';

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

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [{ role: 'user', content: buildPrompt(householdName) }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { chores?: Array<{ title?: string; category?: string; frequency?: string; dayOfWeek?: number | null }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.chores || parsed.chores.length === 0) {
      return NextResponse.json({ error: 'AI response contained no chores' }, { status: 502 });
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

    return NextResponse.json({ chores });
  } catch (error) {
    console.error('homelog suggest-chores error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
