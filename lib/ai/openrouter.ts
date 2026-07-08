// lib/ai/openrouter.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart, type LifestyleAnswers, type WorkoutPlanEntry } from './types';

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
  walk_or_bike: 'Walks or bikes to work',
};

const COMMUTE_MODE_LABEL: Record<string, string> = {
  walk: 'Walks',
  cycle: 'Cycles',
  drive: 'Drives',
  transit: 'Takes public transit',
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

function buildEnvironmentContext(lifestyle: LifestyleAnswers): string {
  const eq = lifestyle.equipment;
  if (!eq) return '';

  const lines: string[] = [];

  const locationLabels: Record<string, string> = {
    commercial_gym: 'Commercial gym',
    home_gym: 'Home gym (with equipment)',
    bodyweight_only: 'Home — bodyweight only, no equipment',
    outdoor: 'Outdoor (parks, tracks, open spaces)',
    mixed: 'Mixed (gym + home/outdoor)',
  };
  lines.push(`- Training location: ${locationLabels[eq.trainingLocation] ?? eq.trainingLocation}`);

  if (eq.availableEquipment.length > 0) {
    lines.push(`- Available equipment: ${eq.availableEquipment.join(', ')}`);
  } else {
    lines.push('- Available equipment: None (bodyweight only)');
  }

  if (eq.homeEnvironment) {
    const home = eq.homeEnvironment;
    lines.push(`- Home space size: ${home.spaceSize}`);
    lines.push(`- Has outdoor space at home: ${home.hasOutdoorSpace ? 'Yes' : 'No'}`);
    lines.push(`- Nearby park/open area: ${home.nearbyPark ? 'Yes' : 'No'}`);
  }

  return lines.join('\n');
}

function buildCommuteContext(lifestyle: LifestyleAnswers): string {
  const d = lifestyle.commuteDetails;
  if (!d) return `- Commute: ${COMMUTE_LABEL[lifestyle.commuteActivity]}`;

  const modeLabel = COMMUTE_MODE_LABEL[d.preferredMode] ?? d.preferredMode;
  const lines = [
    `- Commute mode: ${modeLabel} to work`,
    `- Commute distance: ${d.distanceKm} km each way`,
    `- Work days per week: ${d.workDaysPerWeek}`,
  ];

  const isActive = d.preferredMode === 'walk' || d.preferredMode === 'cycle';
  if (isActive && d.distanceKm > 0) {
    const totalKmPerWeek = d.distanceKm * 2 * d.workDaysPerWeek;
    lines.push(`- Active commute distance: ~${totalKmPerWeek} km/week — this counts as meaningful cardio`);
  }

  return lines.join('\n');
}

function buildWorkoutTypeGuidance(lifestyle: LifestyleAnswers): string {
  const eq = lifestyle.equipment;
  const loc = eq?.trainingLocation ?? 'mixed';
  const isActiveCommuter =
    lifestyle.commuteDetails?.preferredMode === 'walk' ||
    lifestyle.commuteDetails?.preferredMode === 'cycle' ||
    lifestyle.commuteActivity === 'walk_or_bike';

  const parts: string[] = [];

  if (loc === 'commercial_gym' || loc === 'mixed') {
    parts.push('Push, Pull, Legs, Full Body, Cardio are appropriate for gym days.');
  }

  if (loc === 'home_gym' || loc === 'bodyweight_only' || loc === 'mixed') {
    if (eq && eq.availableEquipment.length > 0 && !eq.availableEquipment.includes('None (bodyweight only)')) {
      parts.push('Use "Bodyweight" for home workout days — exercises should use available home equipment.');
    } else {
      parts.push('Use "Bodyweight" for home workout days — no equipment available, use calisthenics (push-ups, squats, lunges, planks, burpees, mountain climbers).');
    }
  }

  if (loc === 'outdoor' || eq?.homeEnvironment?.nearbyPark || eq?.homeEnvironment?.hasOutdoorSpace) {
    parts.push('Use "Outdoor Cardio" for outdoor days — running, cycling, HIIT in a park, hill sprints, etc.');
  }

  if (isActiveCommuter && lifestyle.commuteDetails && lifestyle.commuteDetails.distanceKm >= 2) {
    parts.push(
      `Use "Active Commute" on up to ${Math.min(lifestyle.commuteDetails.workDaysPerWeek, 2)} days — the user's commute ` +
      `(${lifestyle.commuteDetails.distanceKm} km ${lifestyle.commuteDetails.preferredMode}) counts as their cardio for that day.`
    );
  }

  parts.push('Use "Rest" for recovery days.');

  return parts.join(' ');
}

function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  const environmentContext = buildEnvironmentContext(lifestyle);
  const commuteContext = buildCommuteContext(lifestyle);
  const typeGuidance = buildWorkoutTypeGuidance(lifestyle);

  return `You are a certified personal trainer generating a personalised weekly workout schedule.

User profile:
- Age: ${profile.age}
- Weight: ${profile.weight} kg
- Height: ${profile.height} cm
- Self-reported activity level: ${profile.activityLevel}

Lifestyle:
- Job type: ${JOB_TYPE_LABEL[lifestyle.jobType]}
- Hours sitting per day: ${lifestyle.hoursSitting}
${commuteContext}
- Current exercise frequency: ${EXERCISE_FREQUENCY_LABEL[lifestyle.exerciseFrequency]}
- Primary goal: ${GOAL_FOCUS_LABEL[lifestyle.goalFocus]}
- Injuries or limitations: ${lifestyle.injuries || 'None reported'}
- Preferred training days per week: ${lifestyle.preferredTrainingDays}

Training environment:
${environmentContext || '- Not specified (assume mixed gym access)'}

IMPORTANT — workout type selection rules:
${typeGuidance}

Generate a 7-day workout schedule, one entry per day of the week (dayOfWeek 0=Sunday through
6=Saturday). Exactly ${lifestyle.preferredTrainingDays} days must have a non-"Rest" bodyPart;
the remaining ${restDays} days must be "Rest". Choose which body parts/types to use based on
the user's training environment, available equipment, and commute habits above. Do NOT assign
gym-only types (Push/Pull/Legs) to a user who trains at home or bodyweight-only. Avoid
scheduling the same body part on consecutive days. Take injuries or limitations into account.

Each entry's "bodyPart" must be exactly one of: ${BODY_PARTS.join(', ')}.

Respond with ONLY a JSON object of this exact shape, no other text, no markdown code fences:
{"plan":[{"dayOfWeek":0,"bodyPart":"Rest"},{"dayOfWeek":1,"bodyPart":"Bodyweight"}, ... one entry for every day 0-6]}`;
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
  lifestyle: LifestyleAnswers,
  model: string
): Promise<WorkoutPlanEntry[]> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, lifestyle) }],
    response_format: { type: 'json_object' },
  });

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

  return validatePlan(parsed);
}
