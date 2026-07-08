import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import type { LifestyleAnswers } from '@/lib/ai/types';
import { getModel } from '@/lib/ai/modelConfig';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SHOPPING_FREQ_LABEL: Record<string, string> = {
  multiple_per_week: 'shops multiple times per week',
  weekly: 'shops once a week',
  biweekly: 'shops every two weeks',
  monthly: 'shops once a month',
  as_needed: 'shops as needed / no fixed schedule',
};

const BUDGET_LABEL: Record<string, string> = {
  budget: 'budget-conscious (keep costs low)',
  moderate: 'moderate budget',
  flexible: 'flexible budget, willing to spend on quality',
};

const GOAL_LABEL: Record<string, string> = {
  lose_weight: 'lose weight',
  build_muscle: 'build muscle',
  improve_stamina: 'improve stamina',
  general_health: 'general health',
  athletic_performance: 'athletic performance',
};

function buildMealPlanPrompt(lifestyle: LifestyleAnswers, profile: { age: number; weight: number }): string {
  const nutrition = lifestyle.nutrition;
  const grocery = lifestyle.grocery;
  const goal = GOAL_LABEL[lifestyle.goalFocus] ?? lifestyle.goalFocus;

  // Estimate daily calorie target based on goal and weight
  const baseCals = profile.weight * 30;
  const targetCals = lifestyle.goalFocus === 'lose_weight'
    ? Math.round(baseCals * 0.8)
    : lifestyle.goalFocus === 'build_muscle'
    ? Math.round(baseCals * 1.15)
    : baseCals;

  const mealsPerDay = nutrition?.mealsPerDay ?? 3;
  const dietStyle = nutrition?.dietStyle ?? 'none';
  const restrictions = nutrition?.restrictions ?? 'None';
  const store = grocery?.preferredStore ?? 'any grocery store';
  const shoppingFreq = SHOPPING_FREQ_LABEL[grocery?.shoppingFrequency ?? 'weekly'];
  const budget = BUDGET_LABEL[grocery?.budget ?? 'moderate'];
  const cookingSkill = grocery?.cookingSkill ?? 'intermediate';

  return `You are a certified nutritionist and meal planning expert.

User profile:
- Age: ${profile.age}, Weight: ${profile.weight} kg
- Fitness goal: ${goal}
- Target daily calories: ~${targetCals} kcal
- Diet style: ${dietStyle === 'none' ? 'No dietary restrictions' : dietStyle}
- Dietary restrictions / allergies: ${restrictions}
- Meals per day: ${mealsPerDay}
- Preferred grocery store: ${store}
- Shopping frequency: User ${shoppingFreq}
- Budget: ${budget}
- Cooking skill: ${cookingSkill}

Generate a practical 7-day meal plan (Monday through Sunday) with ${mealsPerDay} meals per day.
Make recipes realistic for a ${cookingSkill} cook. Prioritize ingredients commonly found at ${store}.
${grocery?.shoppingFrequency === 'weekly' || grocery?.shoppingFrequency === 'multiple_per_week'
  ? 'Fresh ingredients are fine.'
  : 'Prefer ingredients with longer shelf life since the user shops infrequently.'}

After the meal plan, generate a consolidated grocery list grouped by category (Produce, Protein, Dairy/Alternatives, Grains/Carbs, Pantry/Spices, Frozen).

Respond ONLY with a valid JSON object (no markdown) in this exact shape:
{
  "weekPlan": [
    {
      "day": "Monday",
      "meals": {
        "breakfast": { "name": "...", "description": "brief 1-line description", "calories": 400, "protein": 25, "carbs": 45, "fat": 12, "prepMinutes": 5 },
        "lunch": { "name": "...", "description": "...", "calories": 550, "protein": 35, "carbs": 55, "fat": 15, "prepMinutes": 15 },
        "dinner": { "name": "...", "description": "...", "calories": 650, "protein": 40, "carbs": 65, "fat": 20, "prepMinutes": 25 }${mealsPerDay >= 4 ? ',\n        "snack": { "name": "...", "description": "...", "calories": 200, "protein": 10, "carbs": 20, "fat": 8, "prepMinutes": 0 }' : ''}
      },
      "totalCalories": 1600
    }
    ... (all 7 days, same structure)
  ],
  "groceryList": {
    "Produce": ["item1", "item2"],
    "Protein": ["item1", "item2"],
    "Dairy / Alternatives": ["item1"],
    "Grains & Carbs": ["item1"],
    "Pantry & Spices": ["item1"],
    "Frozen": ["item1"]
  },
  "estimatedWeeklyBudget": "$XX–$XX",
  "nutritionSummary": "One sentence summary of the nutritional approach"
}`;
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('age, weight, lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const MODEL = await getModel(supabase, 'text');

    const lifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;

    const prompt = buildMealPlanPrompt(lifestyle, {
      age: profile.age ?? 30,
      weight: profile.weight ?? 70,
    });

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
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

    if (!result.weekPlan || !result.groceryList) {
      return NextResponse.json({ error: 'AI response missing required fields' }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('meal-plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
