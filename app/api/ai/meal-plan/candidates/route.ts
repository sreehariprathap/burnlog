import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { MANUAL_INGREDIENTS_OPTION, type MealCandidate, type MealPlannerWizardAnswers, type LifestyleAnswers } from '@/lib/ai/types';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const MEAL_TYPES_BY_COUNT: Record<number, string[]> = {
  1: ['lunch'],
  2: ['lunch', 'dinner'],
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'dinner', 'snack'],
};

function buildCandidatesPrompt(answers: MealPlannerWizardAnswers, lifestyle: LifestyleAnswers): string {
  const mealTypes = MEAL_TYPES_BY_COUNT[Math.min(4, Math.max(1, answers.mealsPerDay))] ?? MEAL_TYPES_BY_COUNT[3];
  const dietStyle = lifestyle.nutrition?.dietStyle ?? 'none';
  const restrictions = lifestyle.nutrition?.restrictions ?? 'None';

  const sourceLine = answers.store === MANUAL_INGREDIENTS_OPTION
    ? `The user already has these ingredients on hand and wants to cook mostly from them: ${answers.onHandIngredients.join(', ') || 'nothing specified'}. Minimize new purchases.`
    : `Prioritize ingredients commonly found at ${answers.store}.`;

  const cuisineLine = answers.surpriseMe
    ? 'No cuisine preference — surprise the user with a flexible variety of styles.'
    : `Cuisine styles the user likes: ${answers.cuisinePreferences.join(', ') || 'any'}.`;

  const applianceLine = answers.appliances.length > 0
    ? `Available kitchen appliances: ${answers.appliances.join(', ')}. Only suggest recipes usable with this equipment.`
    : 'The user is not cooking at home — only suggest no-cook / ready-to-eat options.';

  const cookModeLine = answers.cookMode === 'weekly_batch'
    ? `The user batch-cooks once and eats the same meals across the week for ${answers.householdSize} people — favor recipes that reheat/store well.`
    : `The user cooks fresh at each meal for ${answers.householdSize} people — variety across the week is welcome.`;

  const favoritesLine = answers.favoriteMeals?.trim()
    ? `The user's favorite dishes, which they'd like worked in wherever they fit: ${answers.favoriteMeals.trim()}.`
    : '';

  return `You are a certified nutritionist and meal planning expert.

Diet style: ${dietStyle === 'none' ? 'No dietary restrictions' : dietStyle}
Dietary restrictions / allergies: ${restrictions}
${sourceLine}
${cuisineLine}
${applianceLine}
${cookModeLine}
${favoritesLine}

Generate 10 to 12 candidate meal ideas covering these meal types: ${mealTypes.join(', ')}. Each candidate is a standalone recipe idea, not yet assigned to a specific day.

Respond ONLY with a valid JSON object (no markdown) in this exact shape:
{
  "candidates": [
    { "mealType": "breakfast", "name": "...", "description": "brief 1-line description", "calories": 400, "protein": 25, "carbs": 45, "fat": 12, "prepMinutes": 10 }
    ... (10 to 12 total, mealType must be one of: ${mealTypes.join(', ')})
  ]
}`;
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
      .select('lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const answers = (await request.json()) as MealPlannerWizardAnswers;
    const lifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;

    MODEL = await getModel(supabase, 'text');

    const prompt = buildCandidatesPrompt(answers, lifestyle);

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { candidates?: Omit<MealCandidate, 'id'>[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.candidates || parsed.candidates.length === 0) {
      return NextResponse.json({ error: 'AI response missing candidates' }, { status: 502 });
    }

    const candidates: MealCandidate[] = parsed.candidates.map((c, i) => ({ ...c, id: String(i) }));

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('meal-plan candidates error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
