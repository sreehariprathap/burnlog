// lib/workoutVisuals.ts
import type { BodyPart } from './ai/types';

type WorkoutVisual = {
  src: string;
  alt: string;
};

const WORKOUT_VISUALS: Record<BodyPart, WorkoutVisual> = {
  Push: { src: '/workouts/push.svg', alt: 'Push day illustration' },
  Pull: { src: '/workouts/pull.svg', alt: 'Pull day illustration' },
  Legs: { src: '/workouts/legs.svg', alt: 'Legs day illustration' },
  'Full Body': { src: '/workouts/full-body.svg', alt: 'Full body day illustration' },
  Cardio: { src: '/workouts/cardio.svg', alt: 'Cardio day illustration' },
  Rest: { src: '/workouts/rest.svg', alt: 'Rest day illustration' },
};

/** Falls back to the Rest illustration for any value outside the known BodyPart set
 * (defensive only - every caller in this app sources bodyPart from the fixed set). */
export function getWorkoutVisual(bodyPart: string): WorkoutVisual {
  return WORKOUT_VISUALS[bodyPart as BodyPart] ?? WORKOUT_VISUALS.Rest;
}
