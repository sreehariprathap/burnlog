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

// what a user already has access to, beyond gym/home equipment — feeds the
// "Plan My Workout" wizard's suggestions and (hasPlayPartners) a future
// peer-finder feature
export type ResourceAnswers = {
  hasGymMembership: boolean;
  hasSwimmingAccess: boolean;
  hasWalkingShoes: boolean;
  hasBike: boolean;
  hasSportsEquipment: boolean;
  enjoysSports: boolean;
  hasPlayPartners: boolean;
};

export type EquipmentAnswers = {
  trainingLocation: 'commercial_gym' | 'home_gym' | 'bodyweight_only' | 'mixed' | 'outdoor';
  availableEquipment: string[];
  homeEnvironment?: HomeEnvironment;
  resources?: ResourceAnswers;
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
  'Save-On-Foods', 'T&T Supermarket', 'Indian Grocery Store',
  // UK / Europe
  'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Lidl', 'Aldi UK', 'Waitrose',
  // Online
  'Amazon Fresh', 'Instacart',
  // Other
  'Local / Independent Market', 'Other',
] as const;

/** Domain used to fetch a chain's logo via https://logo.clearbit.com/{domain}; omitted entries fall back to a generic icon. */
export const GROCERY_STORE_DOMAINS: Partial<Record<(typeof GROCERY_STORES)[number], string>> = {
  Walmart: 'walmart.com',
  Target: 'target.com',
  Costco: 'costco.com',
  Kroger: 'kroger.com',
  'Whole Foods': 'wholefoodsmarket.com',
  "Trader Joe's": 'traderjoes.com',
  Aldi: 'aldi.us',
  Safeway: 'safeway.com',
  Publix: 'publix.com',
  'H-E-B': 'heb.com',
  Wegmans: 'wegmans.com',
  Meijer: 'meijer.com',
  'Food Lion': 'foodlion.com',
  Loblaws: 'loblaws.ca',
  'No Frills': 'nofrills.ca',
  FreshCo: 'freshco.com',
  Sobeys: 'sobeys.com',
  Metro: 'metro.ca',
  'Real Canadian Superstore': 'realcanadiansuperstore.ca',
  'Save-On-Foods': 'saveonfoods.com',
  'T&T Supermarket': 'tnt-supermarket.com',
  Tesco: 'tesco.com',
  "Sainsbury's": 'sainsburys.co.uk',
  Asda: 'asda.com',
  Morrisons: 'morrisons.com',
  Lidl: 'lidl.com',
  'Aldi UK': 'aldi.co.uk',
  Waitrose: 'waitrose.com',
  'Amazon Fresh': 'amazon.com',
  Instacart: 'instacart.com',
};

export const MANUAL_INGREDIENTS_OPTION = 'Manual — I already have ingredients';

/** Identity key for the user's recurring meal-prep reminder in scheduled_reminders. */
export const MEAL_PREP_REMINDER_TITLE = 'Time to plan your meals';

export type GroceryAnswers = {
  preferredStore: string;
  shoppingFrequency: 'multiple_per_week' | 'weekly' | 'biweekly' | 'monthly' | 'as_needed';
  budget: 'budget' | 'moderate' | 'flexible';
  cookingSkill: 'beginner' | 'intermediate' | 'advanced';
};

export const CUISINE_STYLES = [
  'Continental', 'Canadian', 'Indian', 'Italian', 'Mexican', 'Chinese',
  'Thai', 'Mediterranean', 'Middle Eastern', 'Japanese', 'Other',
] as const;

export const KITCHEN_APPLIANCES = [
  'Stove (gas)', 'Stove (electric/induction)', 'Oven', 'Microwave',
  'Air Fryer', 'Toaster', 'Slow Cooker', 'Instant Pot / Pressure Cooker',
  'Blender', 'Rice Cooker', 'Grill / BBQ',
] as const;

export type MealPlanningAnswers = {
  householdSize: number;
  cookMode: 'weekly_batch' | 'fresh_daily';
  cuisinePreferences: string[]; // ignored when surpriseMe is true
  surpriseMe: boolean;
  kitchenAppliances: string[]; // [] means "not cooking at home"
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
  mealPlanning?: MealPlanningAnswers;
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealCandidate = {
  id: string;
  mealType: MealType;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepMinutes: number;
};

export type MealGridCell = {
  dayOfWeek: number; // 0=Sun..6=Sat
  mealType: MealType;
  meal: MealCandidate | null;
};

export type MealPlannerWizardAnswers = {
  store: string; // one of GROCERY_STORES, or MANUAL_INGREDIENTS_OPTION
  onHandIngredients: string[]; // only meaningful when store === MANUAL_INGREDIENTS_OPTION
  householdSize: number;
  cookMode: 'weekly_batch' | 'fresh_daily';
  mealsPerDay: number;
  cuisinePreferences: string[];
  surpriseMe: boolean;
  appliances: string[];
  /** Freeform favorite dishes/meals the user always wants worked in, e.g. "butter chicken, caesar salad". */
  favoriteMeals: string;
};
