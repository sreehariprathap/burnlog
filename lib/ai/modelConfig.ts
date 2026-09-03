// lib/ai/modelConfig.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type ModelKind = 'text' | 'vision';

export interface AiFeature {
  slot: string;
  label: string;
  description: string;
  app: string;
  kind: ModelKind;
}

/** Every AI feature in the app — the slot id matches the jobType logged to AiJob. */
export const AI_FEATURES = [
  { slot: 'scan-receipt', label: 'Scan Receipt', description: 'Extract items and totals from a photo of a shopping receipt.', app: 'burnlog', kind: 'vision' },
  { slot: 'estimate-workout-calories', label: 'Estimate Workout Calories', description: 'Estimate calories burned from a freeform workout description.', app: 'burnlog', kind: 'text' },
  { slot: 'workout-plan', label: 'Workout Plan', description: 'Generate a personalized workout plan during BurnLog AI onboarding.', app: 'burnlog', kind: 'text' },
  { slot: 'learnlog-suggestions', label: 'LearnLog Suggestions', description: 'Suggest nearby classes or resources for a skill the user is learning.', app: 'learnlog', kind: 'text' },
  { slot: 'moneylog-import-statement', label: 'Import Bank Statement', description: 'Extract transactions from an uploaded bank/card statement PDF or photo.', app: 'moneylog', kind: 'vision' },
  { slot: 'program', label: 'Fitness Program Import', description: 'Convert a pasted freeform fitness/nutrition plan into structured weeks and days.', app: 'burnlog', kind: 'text' },
  { slot: 'learnlog-onboarding', label: 'LearnLog Onboarding', description: 'Suggest starter skills, a career goal, and library items during LearnLog onboarding.', app: 'learnlog', kind: 'text' },
  { slot: 'tasklog-breakdown', label: 'Goal Breakdown', description: 'Break a goal into concrete, actionable tasks.', app: 'tasklog', kind: 'text' },
  { slot: 'tasklog-parse-quick-add', label: 'Quick Add Parsing', description: 'Parse a freeform quick-add entry into a structured task.', app: 'tasklog', kind: 'text' },
  { slot: 'travellog-suggestions', label: 'Trip Suggestions', description: 'Suggest affordable trip ideas based on free time, budget, and holidays.', app: 'travellog', kind: 'text' },
  { slot: 'estimate-food-calories', label: 'Estimate Food Calories', description: 'Estimate calories from a freeform food description.', app: 'burnlog', kind: 'text' },
  { slot: 'categorize-task', label: 'Categorize Task', description: 'Triage and categorize a task on the personal task list.', app: 'tasklog', kind: 'text' },
  { slot: 'tasklog-idea-breakdown', label: 'Idea Breakdown', description: 'Turn a raw idea into an actionable short plan.', app: 'tasklog', kind: 'text' },
  { slot: 'meal-plan-candidates', label: 'Meal Plan Candidates', description: 'Generate candidate meal options for the weekly meal planner.', app: 'burnlog', kind: 'text' },
  { slot: 'meal-plan', label: 'Meal Plan', description: 'Generate a full weekly meal plan.', app: 'burnlog', kind: 'text' },
  { slot: 'travellog-itinerary', label: 'Trip Itinerary', description: 'Generate a day-by-day trip itinerary.', app: 'travellog', kind: 'text' },
  { slot: 'suggest-chores', label: 'Suggest Chores', description: 'Suggest starter chores for a newly created household.', app: 'homelog', kind: 'text' },
  { slot: 'scan-food', label: 'Scan Food Photo', description: 'Estimate calories and nutrition from a photo of food.', app: 'burnlog', kind: 'vision' },
  { slot: 'meal-plan-finalize', label: 'Grocery List from Meal Plan', description: 'Generate a grocery list from the finalized weekly meal set.', app: 'burnlog', kind: 'text' },
  { slot: 'intel-suggest', label: 'IntelLog Suggestions', description: 'Generate the nightly cross-app suggestion feed.', app: 'intellog', kind: 'text' },
] as const satisfies readonly AiFeature[];

export type ModelSlot = (typeof AI_FEATURES)[number]['slot'];

export const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-20b:free';
export const DEFAULT_VISION_MODEL = 'google/gemini-flash-1.5';

export const DEFAULT_MODELS = Object.fromEntries(
  AI_FEATURES.map((f) => [f.slot, f.kind === 'vision' ? DEFAULT_VISION_MODEL : DEFAULT_TEXT_MODEL])
) as Record<ModelSlot, string>;

export async function getModel(supabase: SupabaseClient, slot: ModelSlot): Promise<string> {
  const { data } = await supabase
    .from('ai_model_settings')
    .select('modelId')
    .eq('slot', slot)
    .maybeSingle();

  return data?.modelId || DEFAULT_MODELS[slot];
}
