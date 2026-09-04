import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { buildMealPlanPrompt } from '@/lib/ai/mealPlanPrompt';
import type { LifestyleAnswers } from '@/lib/ai/types';
import { getAge } from '@/lib/age';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

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
      .select('id, dateOfBirth, weight, lifestyle')
      .eq('userId', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    MODEL = await getModel(supabase, 'meal-plan');

    const lifestyle = (profile.lifestyle ?? {}) as LifestyleAnswers;
    // No body is sent when the user hasn't opened the Ask-AI box - request.json()
    // throws on an empty body, so fall back to {} rather than treating it as an error.
    const { customInstructions } = (await request.json().catch(() => ({}))) as { customInstructions?: string };

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'meal-plan', app: 'burnlog', model: MODEL },
        { age: getAge(profile.dateOfBirth), weight: profile.weight, lifestyle, customInstructions },
        async (signal) => {
          const prompt = buildMealPlanPrompt(
            lifestyle,
            { age: profile.dateOfBirth ? getAge(profile.dateOfBirth) : 30, weight: profile.weight ?? 70 },
            customInstructions
          );

          const completion = await client.chat.completions.create({
            model: MODEL,
            temperature: 0.5,
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

          if (!result.weekPlan || !result.groceryList) {
            throw new AiRouteError('AI response missing required fields', 502);
          }

          type GeneratedMeal = {
            name: string;
            description?: string;
            calories?: number;
            protein?: number;
            carbs?: number;
            fat?: number;
            prepMinutes?: number;
          };
          type GeneratedDayPlan = {
            day: string;
            meals: Record<string, GeneratedMeal | undefined>;
          };

          const weekPlan = result.weekPlan as GeneratedDayPlan[];
          const rows: {
            profileId: string;
            dayOfWeek: number;
            mealType: string;
            name: string;
            description: string | null;
            calories: number | null;
            protein: number | null;
            carbs: number | null;
            fat: number | null;
            prepMinutes: number | null;
          }[] = [];

          for (const dayPlan of weekPlan) {
            const dayOfWeek = DAY_NAME_TO_INDEX[dayPlan.day];
            if (dayOfWeek === undefined) continue;
            for (const [mealType, meal] of Object.entries(dayPlan.meals ?? {})) {
              if (!meal) continue;
              rows.push({
                profileId: profile.id,
                dayOfWeek,
                mealType,
                name: meal.name,
                description: meal.description ?? null,
                calories: meal.calories ?? null,
                protein: meal.protein ?? null,
                carbs: meal.carbs ?? null,
                fat: meal.fat ?? null,
                prepMinutes: meal.prepMinutes ?? null,
              });
            }
          }

          if (rows.length > 0) {
            const { error: persistError } = await supabase
              .from('meal_plan_entries')
              .upsert(rows, { onConflict: 'profileId,dayOfWeek,mealType' });
            if (persistError) {
              // Don't fail the request over a persistence hiccup — the user still
              // gets their freshly generated plan back; it just won't show up in
              // the Plan tab's checklist until the next successful generate.
              console.error('meal-plan persist error:', persistError);
            }
          }

          return result;
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
    console.error('meal-plan error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
