// lib/workoutActivities.ts

export const COMMON_ACTIVITIES = [
  'Gym / Weights',
  'Running',
  'Walking',
  'Cycling',
  'Swimming',
  'Hiking',
  'Yoga',
  'HIIT',
  'Rowing',
  'Elliptical',
  'Basketball',
  'Soccer',
  'Badminton',
  'Tennis',
  'Dancing',
  'Other',
] as const;

export type CommonActivity = (typeof COMMON_ACTIVITIES)[number];

export function formatWorkoutNotes(distanceKm?: number, description?: string): string | null {
  const parts: string[] = [];

  if (distanceKm && distanceKm > 0) {
    parts.push(`Distance: ${distanceKm} km`);
  }

  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    parts.push(trimmedDescription);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
