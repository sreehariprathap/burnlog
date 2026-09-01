// app/api/ai/travellog/itinerary/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { buildSystemPrompt, buildUserPrompt, validateItinerary, type ItineraryRequest } from '@/lib/travellog/itinerary';

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

    const body = (await request.json()) as Partial<ItineraryRequest>;
    if (!body.destination || !body.startDate || !body.endDate || !body.transportMode) {
      return NextResponse.json({ error: 'Missing required trip details' }, { status: 400 });
    }

    const req: ItineraryRequest = {
      destination: body.destination,
      hotel: body.hotel || '',
      startDate: body.startDate,
      endDate: body.endDate,
      numPeople: body.numPeople ?? 1,
      transportMode: body.transportMode,
      budget: body.budget ?? null,
      budgetCurrency: body.budgetCurrency || 'USD',
    };

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(req) },
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

    const itinerary = validateItinerary(parsed);
    return NextResponse.json(itinerary);
  } catch (error) {
    console.error('travellog itinerary error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
