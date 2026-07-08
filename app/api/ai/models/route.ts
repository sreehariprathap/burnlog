import { NextResponse } from 'next/server';

type OpenRouterModel = {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

function isFree(model: OpenRouterModel): boolean {
  if (model.id.endsWith(':free')) return true;
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  return prompt === '0' && completion === '0';
}

function isVision(model: OpenRouterModel): boolean {
  return model.architecture?.input_modalities?.includes('image') ?? false;
}

export async function GET() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch model catalog from OpenRouter' }, { status: 502 });
    }

    const body = await res.json();
    const models = (body?.data ?? []) as OpenRouterModel[];

    const free = models.filter(isFree);
    const vision = free
      .filter(isVision)
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const text = free
      .filter((m) => !isVision(m))
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ text, vision });
  } catch (error) {
    console.error('models catalog error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
