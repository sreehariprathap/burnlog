// lib/exerciseImages.ts

const PLACEHOLDER = '/exercises/placeholder.svg';

/**
 * Per-exercise image/gif overrides. Empty for now - fill in as real assets
 * become available, e.g. 'Bench Press': 'https://.../bench-press.gif'.
 * Anything not listed here falls back to the placeholder.
 */
const EXERCISE_IMAGE_OVERRIDES: Record<string, string> = {};

export function getExerciseImage(exerciseName: string): string {
  return EXERCISE_IMAGE_OVERRIDES[exerciseName] ?? PLACEHOLDER;
}
