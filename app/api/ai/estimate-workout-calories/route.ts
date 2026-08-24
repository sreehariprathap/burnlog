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
    const { activityType, durationMinutes, distanceKm, description } = body as {
      activityType?: string;
      durationMinutes?: number;
      distanceKm?: number;
      description?: string;
    };

    if (!activityType || !durationMinutes || durationMinutes <= 0) {
      return NextResponse.json({ error: 'activityType and a positive durationMinutes are required' }, { status: 400 });
    }

    if (activityType === 'Other' && !description?.trim()) {
      return NextResponse.json({ error: 'description is required when activityType is Other' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('weight, age')
      .eq('userId', user.id)
      .single();

    const weight = profile?.weight ?? 70;
    const age = profile?.age ?? 30;

    const activityLine = activityType === 'Other'
      ? `Activity: unspecified — infer the actual activity from this description: "${description?.trim()}"`
      : `Activity: ${activityType}`;

    const paceLine = distanceKm && distanceKm > 0
      ? `\nDistance covered: ${distanceKm} km in ${durationMinutes} minutes (use this pace to judge intensity).`
      : '';

    const prompt = `You are an exercise physiologist estimating calorie expenditure.

${activityLine}
Duration: ${durationMinutes} minutes${paceLine}
User: ${weight} kg, ${age} years old

If the activity was inferred from a description, briefly name the inferred activity in your notes.
Use a MET-based estimate appropriate for this activity type and duration, adjusted for the user's body weight and, if distance/pace was given, adjusted for intensity implied by that pace.

Respond ONLY with a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "caloriesBurned": <integer estimate of total kcal burned for the full duration>,
  "notes": "one short sentence explaining the estimate (e.g. MET value used, inferred activity if applicable)"
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
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
