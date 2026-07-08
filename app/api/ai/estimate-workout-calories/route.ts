import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MODEL = process.env.AI_TEXT_MODEL || 'openai/gpt-oss-120b:free';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { activityType, durationMinutes } = body as {
      activityType?: string;
      durationMinutes?: number;
    };

    if (!activityType || !durationMinutes || durationMinutes <= 0) {
      return NextResponse.json({ error: 'activityType and a positive durationMinutes are required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('weight, age')
      .eq('userId', user.id)
      .single();

    const weight = profile?.weight ?? 70;
    const age = profile?.age ?? 30;

    const prompt = `You are an exercise physiologist estimating calorie expenditure.

Activity: ${activityType}
Duration: ${durationMinutes} minutes
User: ${weight} kg, ${age} years old

Use a MET-based estimate appropriate for this activity type and duration, adjusted for the user's body weight.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "caloriesBurned": <integer estimate of total kcal burned for the full duration>,
  "notes": "one short sentence explaining the estimate (e.g. MET value used)"
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
    const caloriesBurned = Number(result.caloriesBurned);

    if (!caloriesBurned || Number.isNaN(caloriesBurned) || caloriesBurned <= 0) {
      return NextResponse.json({ error: 'AI response missing a valid calorie estimate' }, { status: 502 });
    }

    return NextResponse.json({
      caloriesBurned: Math.round(caloriesBurned),
      notes: result.notes ?? '',
    });
  } catch (error) {
    console.error('estimate-workout-calories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
