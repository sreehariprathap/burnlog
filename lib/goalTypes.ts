// lib/goalTypes.ts

export const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss (kg)' },
  { value: 'weight_gain', label: 'Weight Gain (kg)' },
  { value: 'calories_burned', label: 'Daily Calories Burned (kcal)' },
  { value: 'calories_intake', label: 'Daily Calories Intake (kcal)' },
  { value: 'running_distance', label: 'Running Distance (km)' },
  { value: 'workout_frequency', label: 'Weekly Workouts (count)' },
  { value: 'workout_time', label: 'Workout Duration (mins)' },
  { value: 'daily_steps', label: 'Daily Steps (count)' },
] as const;
