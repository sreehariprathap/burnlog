import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const VISION_MODEL = await getModel(supabase, 'vision');

    const body = await request.json();
    const { imageBase64, mealType = 'meal' } = body as {
      imageBase64: string;
      mealType?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const prompt = `You are a nutrition expert analyzing a food image.

Look at this image carefully and identify the food/meal shown.

Return ONLY a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "foodName": "descriptive name of the food or meal",
  "servingDescription": "estimated portion (e.g. '1 cup', '200g', '1 medium plate')",
  "calories": <number — estimated kcal>,
  "protein": <number — grams of protein>,
  "carbs": <number — grams of carbohydrates>,
  "fat": <number — grams of fat>,
  "fiber": <number — grams of fiber, or 0>,
  "confidence": "high" | "medium" | "low",
  "notes": "any important notes (e.g. 'estimate based on visible portion size', 'multiple items detected')"
}

If you cannot identify food in the image, return:
{"error": "No food detected in this image"}

Be realistic with estimates. If there are multiple items, estimate for the whole visible meal.`;

    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
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

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      foodName: result.foodName ?? 'Unknown food',
      servingDescription: result.servingDescription ?? '',
      calories: Number(result.calories ?? 0),
      protein: Number(result.protein ?? 0),
      carbs: Number(result.carbs ?? 0),
      fat: Number(result.fat ?? 0),
      fiber: Number(result.fiber ?? 0),
      confidence: result.confidence ?? 'medium',
      notes: result.notes ?? '',
      mealType,
    });
  } catch (error) {
    console.error('scan-food error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
