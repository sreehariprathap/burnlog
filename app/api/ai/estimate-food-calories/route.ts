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

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    MODEL = await getModel(supabase, 'estimate-food-calories');

    const body = await request.json();
    const { description, mealType = 'meal' } = body as {
      description?: string;
      mealType?: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: 'No food description provided' }, { status: 400 });
    }

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
        { jobType: 'estimate-food-calories', app: 'burnlog', model: MODEL },
        { description, mealType },
        async (signal) => {
          const prompt = `You are a nutrition expert estimating calories and macros from a text description of a meal.

The description may list multiple items separated by "+", commas, "and", or line breaks — for example "coffee + pancake + a banana". Identify each distinct item, estimate its calories and macros using a typical/average serving size unless the description gives a size, then sum the totals.

Meal description: "${description.trim()}"

Return ONLY a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "foodName": "short combined summary of all items, e.g. 'Coffee, pancake, banana'",
  "calories": <number — total estimated kcal across all items>,
  "protein": <number — total grams of protein>,
  "carbs": <number — total grams of carbohydrates>,
  "fat": <number — total grams of fat>,
  "fiber": <number — total grams of fiber, or 0>,
  "items": [{"name": "item name", "calories": <number>}, ...one entry per distinct item],
  "confidence": "high" | "medium" | "low",
  "notes": "any assumptions made (e.g. serving sizes assumed)"
}

If the description does not describe any food, return:
{"error": "No food described"}

Be realistic with estimates.`;

          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.2,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }, { signal });

          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new AiRouteError('AI returned no response', 502);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            throw new AiRouteError('AI response was not valid JSON', 502);
          }

          const result = parsed as Record<string, unknown>;

          if (result.error) {
            throw new AiRouteError(String(result.error), 422);
          }

          const calories = Number(result.calories ?? 0);
          if (!calories || Number.isNaN(calories) || calories <= 0) {
            throw new AiRouteError('AI response missing a valid calorie estimate', 502);
          }

          const items = Array.isArray(result.items)
            ? (result.items as Array<Record<string, unknown>>)
                .map((item) => ({ name: String(item.name ?? ''), calories: Number(item.calories ?? 0) }))
                .filter((item) => item.name.length > 0)
            : [];

          return {
            foodName: result.foodName ?? 'Unknown food',
            calories: Math.round(calories),
            protein: Number(result.protein ?? 0),
            carbs: Number(result.carbs ?? 0),
            fat: Number(result.fat ?? 0),
            fiber: Number(result.fiber ?? 0),
            items,
            confidence: result.confidence ?? 'medium',
            notes: result.notes ?? '',
            mealType,
          };
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
    console.error('estimate-food-calories error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
