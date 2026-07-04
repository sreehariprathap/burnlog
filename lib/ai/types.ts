// lib/ai/types.ts

export const BODY_PARTS = ['Push', 'Pull', 'Legs', 'Full Body', 'Cardio', 'Rest'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type WorkoutPlanEntry = {
  dayOfWeek: number; // 0=Sun ... 6=Sat
  bodyPart: BodyPart;
};

export type LifestyleAnswers = {
  jobType: 'desk' | 'physical' | 'mixed' | 'not_working';
  hoursSitting: '<2' | '2-4' | '4-6' | '6-8' | '8+';
  commuteActivity: 'sedentary' | 'walk_or_bike';
  exerciseFrequency: 'none' | '1-2' | '3-4' | '5+';
  goalFocus:
    | 'lose_weight'
    | 'build_muscle'
    | 'improve_stamina'
    | 'general_health'
    | 'athletic_performance';
  injuries: string;
  preferredTrainingDays: number; // 3-6
};
