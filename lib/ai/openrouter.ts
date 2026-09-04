// lib/ai/openrouter.ts
import OpenAI from 'openai';
import { BODY_PARTS, type BodyPart, type LifestyleAnswers, type WorkoutPlanEntry } from './types';

export const client = new OpenAI({
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

  if (eq.resources) {
    const r = eq.resources;
    const has: string[] = [];
    const missing: string[] = [];
    if (r.hasGymMembership) has.push('gym membership'); else missing.push('gym membership');
    if (r.hasSwimmingAccess) has.push('pool access'); else missing.push('pool access');
    if (r.hasWalkingShoes) has.push('walking/running shoes'); else missing.push('walking/running shoes');
    if (r.hasBike) has.push('a bike'); else missing.push('a bike');
    if (r.hasSportsEquipment) has.push('sports gear'); else missing.push('sports gear');
    if (has.length > 0) lines.push(`- Has: ${has.join(', ')}`);
    if (missing.length > 0) lines.push(`- Does not have: ${missing.join(', ')} — do not assume these are available`);
    if (r.enjoysSports) {
      lines.push(`- Enjoys sports/games${r.hasPlayPartners ? ' and has people to play with' : ' but has no one to play with yet — favor solo-friendly sports/cardio'}`);
    }
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

  const resources = eq?.resources;
  if (resources?.hasSwimmingAccess) {
    parts.push('The user has pool access — swimming is a valid "Cardio" day option.');
  }
  if (resources?.hasBike) {
    parts.push('The user has a bike — cycling is a valid "Outdoor Cardio"/"Cardio" day option.');
  }
  if (resources?.hasWalkingShoes && !isActiveCommuter) {
    parts.push('The user has walking/running shoes — a walk or jog is a valid light "Cardio" day option.');
  }
  if (resources?.enjoysSports) {
    parts.push(
      resources.hasPlayPartners
        ? 'The user enjoys sports and has people to play with — you may suggest a "Cardio" day framed around a sport (e.g. basketball, soccer, tennis) as a fun alternative to standard cardio.'
        : 'The user enjoys sports but has no one to play with yet — favor solo-friendly cardio over team-sport suggestions.'
    );
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

// Keyword -> bodyPart(s) map used to turn free-text exclusion statements
// (from the onboarding "injuries/limitations" field or an "Ask AI" custom
// instruction, e.g. "I don't have legs" or "no leg day please") into hard
// constraints the prompt can state unambiguously, and that the generated
// plan can be validated against after the fact. This is intentionally a
// simple keyword match, not NLU — it errs toward over-excluding rather than
// silently ignoring a stated limitation.
const BODY_PART_EXCLUSION_RULES: { pattern: RegExp; exclude: BodyPart[] }[] = [
  { pattern: /\bleg(s)?\b|\bknee(s)?\b|\bhip(s)?\b|\bhamstring(s)?\b|\bquad(s)?\b|\bcalf\b|\bcalves\b/i, exclude: ['Legs'] },
  { pattern: /\bshoulder(s)?\b/i, exclude: ['Push', 'Pull'] },
  { pattern: /\bchest\b/i, exclude: ['Push'] },
  { pattern: /\b(lower |upper )?back\b|\bspine\b/i, exclude: ['Pull'] },
  { pattern: /\barm(s)?\b|\belbow(s)?\b|\bwrist(s)?\b/i, exclude: ['Push', 'Pull'] },
  { pattern: /\bcardio\b/i, exclude: ['Cardio', 'Outdoor Cardio'] },
];

/** Fallback types to use, in priority order, when an excluded type must be replaced. */
const SAFE_FALLBACK_ORDER: BodyPart[] = ['Full Body', 'Bodyweight', 'Cardio', 'Rest'];

export function detectExcludedBodyParts(...texts: (string | undefined)[]): BodyPart[] {
  const combined = texts.filter(Boolean).join(' ').toLowerCase();
  if (!combined) return [];
  const excluded = new Set<BodyPart>();
  for (const { pattern, exclude } of BODY_PART_EXCLUSION_RULES) {
    if (pattern.test(combined)) {
      for (const bp of exclude) excluded.add(bp);
    }
  }
  return Array.from(excluded);
}

/**
 * Rewrites any plan entry that was assigned an excluded bodyPart to the
 * highest-priority safe fallback that isn't itself excluded. This is a
 * belt-and-suspenders check: the prompt already tells the model not to use
 * these types, but AI output is non-deterministic, so a stated exclusion
 * (e.g. "no legs") must never be able to survive into the saved plan.
 */
export function enforceExclusions(plan: WorkoutPlanEntry[], excluded: BodyPart[]): WorkoutPlanEntry[] {
  if (excluded.length === 0) return plan;
  const fallback = SAFE_FALLBACK_ORDER.find((bp) => !excluded.includes(bp)) ?? 'Rest';
  return plan.map((entry) =>
    excluded.includes(entry.bodyPart) ? { ...entry, bodyPart: fallback } : entry
  );
}

export function buildPrompt(profile: ProfileContext, lifestyle: LifestyleAnswers, customInstructions?: string): string {
  const restDays = 7 - lifestyle.preferredTrainingDays;
  const environmentContext = buildEnvironmentContext(lifestyle);
  const commuteContext = buildCommuteContext(lifestyle);
  const typeGuidance = buildWorkoutTypeGuidance(lifestyle);
  const excludedBodyParts = detectExcludedBodyParts(lifestyle.injuries, customInstructions);

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
${excludedBodyParts.length > 0 ? `\nHARD CONSTRAINT: the user has stated a limitation or exclusion that makes the following workout type(s) unsafe or impossible for them: ${excludedBodyParts.join(', ')}. Do NOT assign any of these types to ANY day, no exceptions — this overrides every other rule above, including the training-day count and the gym/home guidance. If a day would otherwise use one of these types, substitute a safe alternative such as "Full Body", "Bodyweight", "Cardio", or "Rest" instead.\n` : ''}
Each entry's "bodyPart" must be exactly one of: ${BODY_PARTS.join(', ')}.
${customInstructions ? `\nAdditional instructions from the user (these are hard constraints — they take priority over the general guidance above whenever they conflict): ${customInstructions}\n` : ''}
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
  model: string,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<WorkoutPlanEntry[]> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [{ role: 'user', content: buildPrompt(profile, lifestyle, customInstructions) }],
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

  const plan = validatePlan(parsed);
  const excludedBodyParts = detectExcludedBodyParts(lifestyle.injuries, customInstructions);
  return enforceExclusions(plan, excludedBodyParts);
}
