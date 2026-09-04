// lib/ai/program.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart } from './types';

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

export type GeneratedProgramWeek = {
  weekIndex: number;
  title: string;
  subtitle: string;
  socialActivity: string;
  soloActivity: string;
  checklist: string[];
};

export type GeneratedProgram = {
  title: string;
  subtitle: string;
  totalWeeks: number;
  startWeight: number | null;
  targetWeight: number | null;
  rules: string[];
  weekdayTemplate: { dayOfWeek: number; bodyPart: BodyPart }[];
  mealPlan: {
    meal1: string[];
    meal2: string[];
    eveningShake: string[];
    snacks: string[];
    flexMealNote: string;
  };
  weeks: GeneratedProgramWeek[];
};

function buildPrompt(profile: ProfileContext, pastedPlanText: string): string {
  return `You are structuring a user's freeform multi-week fitness/nutrition transformation plan into a strict JSON schema for an app to persist and track.

User profile (for context only, don't override anything explicit in their pasted plan):
- Age: ${profile.age}
- Weight: ${profile.weight} kg
- Height: ${profile.height} cm
- Activity level: ${profile.activityLevel}

The user's pasted plan:
"""
${pastedPlanText}
"""

Extract and structure this into a JSON object with this exact shape:
{
  "title": "string, a short catchy name for the program (invent one if the plan doesn't have a title)",
  "subtitle": "string, one sentence describing the plan's approach",
  "totalWeeks": number (the plan's duration in weeks; infer from content if not explicit),
  "startWeight": number or null (starting weight in kg if mentioned, else null),
  "targetWeight": number or null (target weight in kg if mentioned, else null),
  "rules": ["string", ...] (the plan's daily/ongoing rules or habits to maintain — short, imperative phrasing),
  "weekdayTemplate": [{"dayOfWeek": 0-6, "bodyPart": one of ${BODY_PARTS.join(', ')}}, ... exactly 7 entries, one per day 0=Sunday..6=Saturday, covering every day exactly once] (the plan's recurring weekly workout schedule; use "Rest" for rest/recovery days),
  "mealPlan": {
    "meal1": ["string", ...] (first-meal-of-the-day options/guidance),
    "meal2": ["string", ...] (main-meal-of-the-day options/guidance),
    "eveningShake": ["string", ...] (evening snack/shake guidance, empty array if not applicable),
    "snacks": ["string", ...] (between-meal snack options),
    "flexMealNote": "string, guidance on the plan's flexible/cheat meal allowance, empty string if not applicable"
  },
  "weeks": [
    {
      "weekIndex": number (1-based, 1 through totalWeeks, every value exactly once),
      "title": "string, this week's short theme/title",
      "subtitle": "string, one short phrase describing this week's difficulty/focus",
      "socialActivity": "string, a weekend/social activity suggestion for this week (empty string if the plan doesn't distinguish social vs solo)",
      "soloActivity": "string, a weekend/solo activity suggestion for this week (empty string if not applicable)",
      "checklist": ["string", ...] (this week's specific checklist items to complete, e.g. "Mon-Fri workouts done", "Weigh-in logged")
    }
    ... one entry for every week 1 through totalWeeks
  ]
}

Respond with ONLY the JSON object, no other text, no markdown code fences.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function validateProgramPlan(raw: unknown): GeneratedProgram {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.title !== 'string' || typeof r.subtitle !== 'string') {
    throw new Error('AI response missing title/subtitle');
  }
  if (typeof r.totalWeeks !== 'number' || r.totalWeeks < 1 || r.totalWeeks > 52) {
    throw new Error('AI response has an invalid totalWeeks');
  }
  const startWeight = typeof r.startWeight === 'number' ? r.startWeight : null;
  const targetWeight = typeof r.targetWeight === 'number' ? r.targetWeight : null;

  if (!isStringArray(r.rules)) {
    throw new Error('AI response has an invalid rules array');
  }

  if (!Array.isArray(r.weekdayTemplate) || r.weekdayTemplate.length !== 7) {
    throw new Error('AI response weekdayTemplate must have exactly 7 entries');
  }
  const seenDays = new Set<number>();
  const weekdayTemplate = (r.weekdayTemplate as unknown[]).map((entry) => {
    const dayOfWeek = (entry as { dayOfWeek?: unknown } | null)?.dayOfWeek;
    const bodyPart = (entry as { bodyPart?: unknown } | null)?.bodyPart;
    if (
      typeof dayOfWeek !== 'number' ||
      typeof bodyPart !== 'string' ||
      !(BODY_PARTS as readonly string[]).includes(bodyPart)
    ) {
      throw new Error('AI response has a malformed weekdayTemplate entry');
    }
    if (dayOfWeek < 0 || dayOfWeek > 6 || seenDays.has(dayOfWeek)) {
      throw new Error(`AI response has an invalid or duplicate dayOfWeek: ${dayOfWeek}`);
    }
    seenDays.add(dayOfWeek);
    return { dayOfWeek, bodyPart: bodyPart as BodyPart };
  });
  if (seenDays.size !== 7) {
    throw new Error('AI response weekdayTemplate does not cover all 7 days');
  }
  weekdayTemplate.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const mealPlanRaw = r.mealPlan as Record<string, unknown> | undefined;
  if (
    !mealPlanRaw ||
    !isStringArray(mealPlanRaw.meal1) ||
    !isStringArray(mealPlanRaw.meal2) ||
    !isStringArray(mealPlanRaw.eveningShake) ||
    !isStringArray(mealPlanRaw.snacks) ||
    typeof mealPlanRaw.flexMealNote !== 'string'
  ) {
    throw new Error('AI response has an invalid mealPlan');
  }
  const mealPlan = {
    meal1: mealPlanRaw.meal1 as string[],
    meal2: mealPlanRaw.meal2 as string[],
    eveningShake: mealPlanRaw.eveningShake as string[],
    snacks: mealPlanRaw.snacks as string[],
    flexMealNote: mealPlanRaw.flexMealNote as string,
  };

  if (!Array.isArray(r.weeks) || r.weeks.length !== r.totalWeeks) {
    throw new Error(`AI response has ${Array.isArray(r.weeks) ? r.weeks.length : 0} weeks, expected ${r.totalWeeks}`);
  }
  const seenWeekIndices = new Set<number>();
  const weeks: GeneratedProgramWeek[] = (r.weeks as unknown[]).map((entry) => {
    const w = entry as Record<string, unknown>;
    if (
      typeof w.weekIndex !== 'number' ||
      typeof w.title !== 'string' ||
      typeof w.subtitle !== 'string' ||
      typeof w.socialActivity !== 'string' ||
      typeof w.soloActivity !== 'string' ||
      !isStringArray(w.checklist) ||
      (w.checklist as string[]).length === 0
    ) {
      throw new Error('AI response has a malformed week entry');
    }
    if (w.weekIndex < 1 || w.weekIndex > (r.totalWeeks as number) || seenWeekIndices.has(w.weekIndex)) {
      throw new Error(`AI response has an invalid or duplicate weekIndex: ${w.weekIndex}`);
    }
    seenWeekIndices.add(w.weekIndex);
    return {
      weekIndex: w.weekIndex,
      title: w.title,
      subtitle: w.subtitle,
      socialActivity: w.socialActivity,
      soloActivity: w.soloActivity,
      checklist: w.checklist as string[],
    };
  });
  if (seenWeekIndices.size !== (r.totalWeeks as number)) {
    throw new Error('AI response weeks do not cover every weekIndex from 1 to totalWeeks');
  }
  weeks.sort((a, b) => a.weekIndex - b.weekIndex);

  return {
    title: r.title,
    subtitle: r.subtitle,
    totalWeeks: r.totalWeeks,
    startWeight,
    targetWeight,
    rules: r.rules as string[],
    weekdayTemplate,
    mealPlan,
    weeks,
  };
}

export async function generateProgram(
  profile: ProfileContext,
  pastedPlanText: string,
  model: string,
  signal?: AbortSignal
): Promise<GeneratedProgram> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, pastedPlanText) }],
    response_format: { type: 'json_object' },
  }, { signal });

  if (!completion.choices || completion.choices.length === 0) {
    const providerError = (completion as unknown as { error?: { message?: string } }).error;
    throw new Error(providerError?.message || 'AI provider returned no response choices');
  }

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

  return validateProgramPlan(parsed);
}
