// lib/ai/validateHabitClassification.ts
//
// Validates the JSON shape returned by POST /api/ai/classify-habit's model
// call, split out from the route so it's unit-testable without mocking the
// OpenAI client (no AI route in this codebase has a route-level test today).

import type { AppId } from '@/lib/appMode';

export interface HabitClassification {
  title: string;
  sourceApp: AppId | null;
  isRecurring: boolean;
  suggestedRecurrence?: {
    daysOfWeek?: number[];
    intervalWeeks?: number;
  };
}

export function validateHabitClassification(parsed: unknown, validAppIds: readonly string[]): HabitClassification {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI response was not a JSON object');
  }
  const result = parsed as Record<string, unknown>;

  if (typeof result.title !== 'string' || !result.title.trim()) {
    throw new Error('AI response had an invalid title');
  }

  const sourceAppRaw = result.sourceApp;
  if (sourceAppRaw !== null && (typeof sourceAppRaw !== 'string' || !validAppIds.includes(sourceAppRaw))) {
    throw new Error('AI response had an invalid sourceApp');
  }

  if (typeof result.isRecurring !== 'boolean') {
    throw new Error('AI response had an invalid isRecurring flag');
  }

  let suggestedRecurrence: HabitClassification['suggestedRecurrence'];
  if (result.suggestedRecurrence !== undefined) {
    if (typeof result.suggestedRecurrence !== 'object' || result.suggestedRecurrence === null) {
      throw new Error('AI response had an invalid suggestedRecurrence');
    }
    const raw = result.suggestedRecurrence as Record<string, unknown>;
    suggestedRecurrence = {};

    if (raw.daysOfWeek !== undefined) {
      const valid = Array.isArray(raw.daysOfWeek) && raw.daysOfWeek.every((d) => typeof d === 'number' && d >= 0 && d <= 6);
      if (!valid) throw new Error('AI response had an invalid suggestedRecurrence.daysOfWeek');
      suggestedRecurrence.daysOfWeek = raw.daysOfWeek as number[];
    }

    if (raw.intervalWeeks !== undefined) {
      if (typeof raw.intervalWeeks !== 'number' || raw.intervalWeeks < 1) {
        throw new Error('AI response had an invalid suggestedRecurrence.intervalWeeks');
      }
      suggestedRecurrence.intervalWeeks = raw.intervalWeeks;
    }
  }

  return {
    title: result.title.trim(),
    sourceApp: (sourceAppRaw ?? null) as AppId | null,
    isRecurring: result.isRecurring,
    suggestedRecurrence,
  };
}
