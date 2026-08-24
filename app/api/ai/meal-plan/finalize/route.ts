import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { MANUAL_INGREDIENTS_OPTION, type MealGridCell, type MealPlannerWizardAnswers, type LifestyleAnswers } from '@/lib/ai/types';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function buildGroceryListPrompt(grid: MealGridCell[], answers: MealPlannerWizardAnswers): string {
  const mealLines = grid
    .filter((cell) => cell.meal)
    .map((cell) => `- ${cell.meal!.name}: ${cell.meal!.description}`)
    .filter((line, i, arr) => arr.indexOf(line) === i) // dedupe repeated batch-cook meals
    .join('\n');

  const sourceLine = answers.store === MANUAL_INGREDIENTS_OPTION
    ? `The user already has these on hand: ${answers.onHandIngredients.join(', ') || 'nothing specified'}. Exclude them from the list unless more is needed.`
    : `Estimate typical prices for ${answers.store}.`;

  return `You are a grocery planning assistant. Given this finalized weekly meal set for a household of ${answers.householdSize} people:

${mealLines}

${sourceLine}

Generate a consolidated grocery list grouped by category (Produce, Protein, Dairy/Alternatives, Grains/Carbs, Pantry/Spices, Frozen), with quantities scaled for ${answers.householdSize} people across the week, and an estimated total weekly budget range.

Respond ONLY with a valid JSON object (no markdown) in this exact shape:
{
  "groceryList": {
    "Produce": ["item1", "item2"],
    "Protein": ["item1"],
    "Dairy / Alternatives": ["item1"],
    "Grains & Carbs": ["item1"],
    "Pantry & Spices": ["item1"],
    "Frozen": ["item1"]
  },
  "estimatedBudget": "$XX–$XX"
}`;
}

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = (await request.json()) as { grid: MealGridCell[]; answers: MealPlannerWizardAnswers };
    const { grid, answers } = body;

    if (!grid || grid.length === 0) {
      return NextResponse.json({ error: 'No meals to finalize' }, { status: 400 });
    }

    MODEL = await getModel(supabase, 'text');

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [{ role: 'user', content: buildGroceryListPrompt(grid, answers) }],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'AI returned no response' }, { status: 502 });
    }

    let parsed: { groceryList?: Record<string, string[]>; estimatedBudget?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
    }

    if (!parsed.groceryList) {
      return NextResponse.json({ error: 'AI response missing grocery list' }, { status: 502 });
    }

    const rows = grid
      .filter((cell) => cell.meal)
      .map((cell) => ({
        profileId: profile.id,
        dayOfWeek: cell.dayOfWeek,
        mealType: cell.mealType,
        name: cell.meal!.name,
        description: cell.meal!.description,
        calories: cell.meal!.calories ?? null,
        protein: cell.meal!.protein ?? null,
        carbs: cell.meal!.carbs ?? null,
        fat: cell.meal!.fat ?? null,
        prepMinutes: cell.meal!.prepMinutes ?? null,
      }));

    const { error: mealPlanError } = await supabase
      .from('meal_plan_entries')
      .upsert(rows, { onConflict: 'profileId,dayOfWeek,mealType' });
    if (mealPlanError) console.error('finalize: meal_plan_entries upsert failed:', mealPlanError);

    const { error: groceryError } = await supabase
      .from('grocery_lists')
      .upsert(
        { profileId: profile.id, items: parsed.groceryList, estimatedBudget: parsed.estimatedBudget ?? null },
        { onConflict: 'profileId' }
      );
    if (groceryError) console.error('finalize: grocery_lists upsert failed:', groceryError);

    const existingLifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        lastMealPlanGeneratedAt: new Date().toISOString(),
        lifestyle: {
          ...existingLifestyle,
          mealPlanning: {
            householdSize: answers.householdSize,
            cookMode: answers.cookMode,
            cuisinePreferences: answers.cuisinePreferences,
            surpriseMe: answers.surpriseMe,
            kitchenAppliances: answers.appliances,
          },
        },
      })
      .eq('id', profile.id);
    if (profileError) console.error('finalize: profile update failed:', profileError);

    return NextResponse.json({ groceryList: parsed.groceryList, estimatedBudget: parsed.estimatedBudget ?? '' });
  } catch (error) {
    console.error('meal-plan finalize error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
