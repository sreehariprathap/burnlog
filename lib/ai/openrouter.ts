// lib/ai/openrouter.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart, type LifestyleAnswers, type WorkoutPlanEntry } from './types';

const MODEL = process.env.AI_WORKOUT_MODEL || 'openai/gpt-oss-120b:free';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

type ProfileContext = {
  age: number;
  weight: number;
  height: number;
  activityLevel: string;
};

const JOB_TYPE_LABEL: Record<LifestyleAnswers['jobType'], string> = {
  desk: 'Desk job (mostly sitting)',
  physical: 'Physical labor (mostly standing/moving)',
  mixed: 'Mixed (some sitting, some physical activity)',
  not_working: 'Not currently working',
};

const COMMUTE_LABEL: Record<LifestyleAnswers['commuteActivity'], string> = {
  sedentary: 'Sedentary (car/public transit)',
  walk_or_bike: 'Walks or bikes',
};

const EXERCISE_FREQUENCY_LABEL: Record<LifestyleAnswers['exerciseFrequency'], string> = {
  none: 'None',
  '1-2': '1-2 times per week',
  '3-4': '3-4 times per week',
  '5+': '5 or more times per week',
};

const GOAL_FOCUS_LABEL: Record<LifestyleAnswers['goalFocus'], string> = {
  lose_weight: 'Lose weight',
  build_muscle: 'Build muscle',
  improve_stamina: 'Improve stamina',
  general_health: 'General health',
  athletic_performance: 'Athletic performance',
};

function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  return `You are a certified personal trainer generating a weekly workout schedule.

User profile:
- Age: ${profile.age}
- Weight: ${profile.weight} kg
- Height: ${profile.height} cm
- Self-reported activity level: ${profile.activityLevel}

Lifestyle:
- Job type: ${JOB_TYPE_LABEL[lifestyle.jobType]}
- Hours sitting per day: ${lifestyle.hoursSitting}
- Commute activity: ${COMMUTE_LABEL[lifestyle.commuteActivity]}
- Current exercise frequency: ${EXERCISE_FREQUENCY_LABEL[lifestyle.exerciseFrequency]}
- Primary goal: ${GOAL_FOCUS_LABEL[lifestyle.goalFocus]}
- Injuries or limitations: ${lifestyle.injuries || 'None reported'}
- Preferred training days per week: ${lifestyle.preferredTrainingDays}

Generate a 7-day workout schedule, one entry per day of the week (dayOfWeek 0=Sunday through
6=Saturday). Exactly ${lifestyle.preferredTrainingDays} days must have a non-"Rest" bodyPart;
the remaining ${restDays} days must be "Rest". Choose which body parts to train and how to
distribute them across the week based on the user's goal and lifestyle above (e.g. avoid
scheduling the same body part on consecutive days where reasonable, and take injuries or
limitations into account when picking body parts).

Each entry's "bodyPart" must be exactly one of: ${BODY_PARTS.join(', ')}.

Respond with ONLY a JSON object of this exact shape, no other text, no markdown code fences:
{"plan":[{"dayOfWeek":0,"bodyPart":"Rest"},{"dayOfWeek":1,"bodyPart":"Push"}, ... one entry for every day 0-6]}`;
}

function validatePlan(raw: unknown): WorkoutPlanEntry[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { plan?: unknown }).plan)) {
    throw new Error('AI response missing a "plan" array');
  }
  const plan = (raw as { plan: unknown[] }).plan;
  if (plan.length !== 7) {
    throw new Error(`AI response has ${plan.length} entries, expected 7`);
  }

  const seenDays = new Set<number>();
  const result: WorkoutPlanEntry[] = [];
  for (const entry of plan) {
    const dayOfWeek = (entry as { dayOfWeek?: unknown } | null)?.dayOfWeek;
    const bodyPart = (entry as { bodyPart?: unknown } | null)?.bodyPart;

    if (
      typeof dayOfWeek !== 'number' ||
      typeof bodyPart !== 'string' ||
      !(BODY_PARTS as readonly string[]).includes(bodyPart)
    ) {
      throw new Error('AI response contains a malformed plan entry');
    }
    if (dayOfWeek < 0 || dayOfWeek > 6 || seenDays.has(dayOfWeek)) {
      throw new Error(`AI response has an invalid or duplicate dayOfWeek: ${dayOfWeek}`);
    }
    seenDays.add(dayOfWeek);
    result.push({ dayOfWeek, bodyPart: bodyPart as BodyPart });
  }

  if (seenDays.size !== 7) {
    throw new Error('AI response does not cover all 7 days of the week');
  }
  return result.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export async function generateWorkoutPlan(
  profile: ProfileContext,
  lifestyle: LifestyleAnswers
): Promise<WorkoutPlanEntry[]> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, lifestyle) }],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI response had no content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  return validatePlan(parsed);
}
