import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { EXPENSE_CATEGORIES } from '@/lib/financeCategories';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let VISION_MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    VISION_MODEL = await getModel(supabase, 'vision');

    const body = await request.json();
    const { imageBase64 } = body as { imageBase64: string };

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const categoryValues = EXPENSE_CATEGORIES.map((c) => c.value).join('", "');

    const prompt = `You are a receipt-reading assistant analyzing a photo of a purchase receipt.

Look at this image carefully and extract the transaction details.

Return ONLY a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "merchant": "name of the store/merchant",
  "amount": <number — total amount paid>,
  "date": "YYYY-MM-DD — the date printed on the receipt, or today's date if not visible",
  "category": one of "${categoryValues}",
  "confidence": "high" | "medium" | "low",
  "notes": "brief note, e.g. list of a few notable items"
}

Pick the category that best matches the merchant/items (e.g. a supermarket receipt is "groceries", a ride/fuel receipt is "transportation"). If nothing fits well, use "other_expense".

If you cannot identify a receipt in the image, return:
{"error": "No receipt detected in this image"}`;

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
      merchant: result.merchant ?? 'Unknown merchant',
      amount: Number(result.amount ?? 0),
      date: result.date ?? new Date().toISOString().slice(0, 10),
      category: result.category ?? 'other_expense',
      confidence: result.confidence ?? 'medium',
      notes: result.notes ?? '',
    });
  } catch (error) {
    console.error('scan-receipt error:', error);
    return NextResponse.json({ error: formatAiError(VISION_MODEL, error) }, { status: 500 });
  }
}
