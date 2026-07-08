// lib/ai/types.ts

export const BODY_PARTS = [
  'Push',
  'Pull',
  'Legs',
  'Full Body',
  'Cardio',
  'Rest',
  'Bodyweight',
  'Outdoor Cardio',
  'Active Commute',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type WorkoutPlanEntry = {
  dayOfWeek: number; // 0=Sun ... 6=Sat
  bodyPart: BodyPart;
};

export const ACTIVITY_TYPES = ['Weights', 'Cardio', 'Sports', 'Yoga', 'HIIT', 'Swimming', 'Bodyweight', 'Cycling', 'Running'] as const;

export const EQUIPMENT_OPTIONS = [
  // Gym
  'Dumbbells',
  'Barbell',
  'Resistance Bands',
  'Pull-up Bar',
  'Cardio Machine',
  'Kettlebell',
  // Home-friendly
  'Yoga Mat',
  'Jump Rope',
  'Foam Roller',
  'Parallette Bars',
  'TRX / Suspension Trainer',
  // None
  'None (bodyweight only)',
] as const;

export type ActivityPreferences = {
  enjoyedTypes: string[];
  dislikedTypes: string[];
  environment: 'indoor' | 'outdoor' | 'either';
  social: 'solo' | 'group' | 'either';
};

export type HomeEnvironment = {
  hasOutdoorSpace: boolean;
  nearbyPark: boolean;
  spaceSize: 'small' | 'medium' | 'large';
};

export type EquipmentAnswers = {
  trainingLocation: 'commercial_gym' | 'home_gym' | 'bodyweight_only' | 'mixed' | 'outdoor';
  availableEquipment: string[];
  homeEnvironment?: HomeEnvironment;
};

export type CommuteDetails = {
  distanceKm: number;
  preferredMode: 'walk' | 'cycle' | 'drive' | 'transit';
  workDaysPerWeek: number;
};

export type NutritionAnswers = {
  dietStyle: 'none' | 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'other';
  mealsPerDay: number;
  restrictions: string;
};

export const GROCERY_STORES = [
  // North America
  'Walmart', 'Target', 'Costco', 'Kroger', 'Whole Foods', "Trader Joe's",
  'Aldi', 'Safeway', 'Publix', 'H-E-B', 'Wegmans', 'Meijer', 'Food Lion',
  // Canada
  'Loblaws', "No Frills", 'FreshCo', 'Sobeys', 'Metro', 'Real Canadian Superstore',
  // UK / Europe
  'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Lidl', 'Aldi UK', 'Waitrose',
  // Online
  'Amazon Fresh', 'Instacart',
  // Other
  'Local / Independent Market', 'Other',
] as const;

export type GroceryAnswers = {
  preferredStore: string;
  shoppingFrequency: 'multiple_per_week' | 'weekly' | 'biweekly' | 'monthly' | 'as_needed';
  budget: 'budget' | 'moderate' | 'flexible';
  cookingSkill: 'beginner' | 'intermediate' | 'advanced';
};

export type LifestyleAnswers = {
  jobType: 'desk' | 'physical' | 'mixed' | 'not_working';
  hoursSitting: '<2' | '2-4' | '4-6' | '6-8' | '8+';
  commuteActivity: 'sedentary' | 'walk_or_bike';
  commuteDetails?: CommuteDetails;
  exerciseFrequency: 'none' | '1-2' | '3-4' | '5+';
  goalFocus:
    | 'lose_weight'
    | 'build_muscle'
    | 'improve_stamina'
    | 'general_health'
    | 'athletic_performance';
  injuries: string;
  preferredTrainingDays: number; // 3-6
  activityPreferences?: ActivityPreferences;
  equipment?: EquipmentAnswers;
  nutrition?: NutritionAnswers;
  grocery?: GroceryAnswers;
};
