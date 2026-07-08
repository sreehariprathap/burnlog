/**
 * Master exercise database.
 *
 * equipment: [] = bodyweight / no equipment needed
 * equipment: ['X','Y'] = user needs ANY ONE of X or Y to perform this exercise
 *
 * muscleGroup: determines which section of a workout card this appears under.
 * bodyParts: which workout types this exercise belongs to.
 */

export type ExerciseRecord = {
  name: string;
  muscleGroup: string;
  bodyParts: string[];   // 'Push' | 'Pull' | 'Legs' | 'Full Body' | 'Bodyweight' etc.
  equipment: string[];   // any of these satisfies the requirement (empty = no gear needed)
};

export const EXERCISES: ExerciseRecord[] = [
  // ─── PUSH ───────────────────────────────────────────────────────
  // Chest — bodyweight
  { name: 'Push-Ups',               muscleGroup: 'Chest',     bodyParts: ['Push','Full Body','Bodyweight'], equipment: [] },
  { name: 'Wide Push-Ups',           muscleGroup: 'Chest',     bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Diamond Push-Ups',        muscleGroup: 'Chest',     bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Decline Push-Ups',        muscleGroup: 'Chest',     bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Pike Push-Ups',           muscleGroup: 'Chest',     bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Archer Push-Ups',         muscleGroup: 'Chest',     bodyParts: ['Push','Bodyweight'],             equipment: [] },
  // Chest — equipment
  { name: 'Bench Press',             muscleGroup: 'Chest',     bodyParts: ['Push','Full Body'],              equipment: ['Barbell'] },
  { name: 'Incline Bench Press',     muscleGroup: 'Chest',     bodyParts: ['Push'],                          equipment: ['Barbell'] },
  { name: 'Dumbbell Press',          muscleGroup: 'Chest',     bodyParts: ['Push','Full Body'],              equipment: ['Dumbbells'] },
  { name: 'Incline Dumbbell Press',  muscleGroup: 'Chest',     bodyParts: ['Push'],                          equipment: ['Dumbbells'] },
  { name: 'Chest Fly',               muscleGroup: 'Chest',     bodyParts: ['Push'],                          equipment: ['Dumbbells'] },
  { name: 'Kettlebell Press',        muscleGroup: 'Chest',     bodyParts: ['Push'],                          equipment: ['Kettlebell'] },
  { name: 'Band Chest Press',        muscleGroup: 'Chest',     bodyParts: ['Push'],                          equipment: ['Resistance Bands'] },
  // Shoulders — bodyweight
  { name: 'Pike Shoulder Press',     muscleGroup: 'Shoulders', bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Shoulder Tap Plank',      muscleGroup: 'Shoulders', bodyParts: ['Push','Bodyweight'],             equipment: [] },
  // Shoulders — equipment
  { name: 'Overhead Press',          muscleGroup: 'Shoulders', bodyParts: ['Push','Full Body'],              equipment: ['Barbell','Dumbbells','Kettlebell'] },
  { name: 'Lateral Raise',           muscleGroup: 'Shoulders', bodyParts: ['Push'],                          equipment: ['Dumbbells','Resistance Bands'] },
  { name: 'Front Raise',             muscleGroup: 'Shoulders', bodyParts: ['Push'],                          equipment: ['Dumbbells','Resistance Bands'] },
  { name: 'Arnold Press',            muscleGroup: 'Shoulders', bodyParts: ['Push'],                          equipment: ['Dumbbells'] },
  { name: 'Band Lateral Raise',      muscleGroup: 'Shoulders', bodyParts: ['Push'],                          equipment: ['Resistance Bands'] },
  { name: 'Reverse Fly',             muscleGroup: 'Shoulders', bodyParts: ['Push'],                          equipment: ['Dumbbells','Resistance Bands'] },
  // Triceps — bodyweight
  { name: 'Tricep Dips (chair)',     muscleGroup: 'Triceps',   bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Close-Grip Push-Ups',     muscleGroup: 'Triceps',   bodyParts: ['Push','Bodyweight'],             equipment: [] },
  { name: 'Bench Dips',              muscleGroup: 'Triceps',   bodyParts: ['Push','Bodyweight'],             equipment: [] },
  // Triceps — equipment
  { name: 'Dips',                    muscleGroup: 'Triceps',   bodyParts: ['Push'],                          equipment: ['Parallette Bars'] },
  { name: 'Skull Crushers',          muscleGroup: 'Triceps',   bodyParts: ['Push'],                          equipment: ['Barbell','Dumbbells'] },
  { name: 'Overhead Tricep Ext.',    muscleGroup: 'Triceps',   bodyParts: ['Push'],                          equipment: ['Dumbbells','Kettlebell'] },
  { name: 'Tricep Pushdown',         muscleGroup: 'Triceps',   bodyParts: ['Push'],                          equipment: ['Resistance Bands'] },
  { name: 'Close-Grip Bench Press',  muscleGroup: 'Triceps',   bodyParts: ['Push'],                          equipment: ['Barbell'] },

  // ─── PULL ───────────────────────────────────────────────────────
  // Back — bodyweight
  { name: 'Inverted Rows (table)',   muscleGroup: 'Back',      bodyParts: ['Pull','Bodyweight'],             equipment: [] },
  { name: 'Superman Hold',           muscleGroup: 'Back',      bodyParts: ['Pull','Bodyweight'],             equipment: [] },
  { name: 'Good Mornings (BW)',      muscleGroup: 'Back',      bodyParts: ['Pull','Bodyweight'],             equipment: [] },
  // Back — equipment
  { name: 'Pull-Ups',                muscleGroup: 'Back',      bodyParts: ['Pull','Full Body'],              equipment: ['Pull-up Bar'] },
  { name: 'Chin-Ups',                muscleGroup: 'Back',      bodyParts: ['Pull'],                          equipment: ['Pull-up Bar'] },
  { name: 'TRX Rows',                muscleGroup: 'Back',      bodyParts: ['Pull','Bodyweight'],             equipment: ['TRX / Suspension Trainer'] },
  { name: 'Band Pull-Apart',         muscleGroup: 'Back',      bodyParts: ['Pull'],                          equipment: ['Resistance Bands'] },
  { name: 'Band Row',                muscleGroup: 'Back',      bodyParts: ['Pull'],                          equipment: ['Resistance Bands'] },
  { name: 'Bent-over Row',           muscleGroup: 'Back',      bodyParts: ['Pull','Full Body'],              equipment: ['Barbell','Dumbbells'] },
  { name: 'Dumbbell Row',            muscleGroup: 'Back',      bodyParts: ['Pull'],                          equipment: ['Dumbbells','Kettlebell'] },
  { name: 'Lat Pulldown (Band)',     muscleGroup: 'Back',      bodyParts: ['Pull'],                          equipment: ['Resistance Bands'] },
  { name: 'Deadlift',                muscleGroup: 'Back',      bodyParts: ['Pull','Full Body'],              equipment: ['Barbell'] },
  { name: 'Kettlebell Swing',        muscleGroup: 'Back',      bodyParts: ['Pull','Full Body'],              equipment: ['Kettlebell'] },
  // Biceps — bodyweight
  { name: 'Towel Curl',              muscleGroup: 'Biceps',    bodyParts: ['Pull','Bodyweight'],             equipment: [] },
  { name: 'Isometric Curl (table)',  muscleGroup: 'Biceps',    bodyParts: ['Pull','Bodyweight'],             equipment: [] },
  // Biceps — equipment
  { name: 'Barbell Curl',            muscleGroup: 'Biceps',    bodyParts: ['Pull'],                          equipment: ['Barbell'] },
  { name: 'Dumbbell Curl',           muscleGroup: 'Biceps',    bodyParts: ['Pull','Full Body'],              equipment: ['Dumbbells'] },
  { name: 'Hammer Curl',             muscleGroup: 'Biceps',    bodyParts: ['Pull'],                          equipment: ['Dumbbells','Kettlebell'] },
  { name: 'Resistance Band Curl',    muscleGroup: 'Biceps',    bodyParts: ['Pull'],                          equipment: ['Resistance Bands'] },
  { name: 'Concentration Curl',      muscleGroup: 'Biceps',    bodyParts: ['Pull'],                          equipment: ['Dumbbells'] },
  // Forearms
  { name: "Farmer's Walk",           muscleGroup: 'Forearms',  bodyParts: ['Pull'],                          equipment: ['Dumbbells','Kettlebell','Barbell'] },
  { name: 'Wrist Curls',             muscleGroup: 'Forearms',  bodyParts: ['Pull'],                          equipment: ['Dumbbells','Barbell'] },
  { name: 'Dead Hangs',              muscleGroup: 'Forearms',  bodyParts: ['Pull'],                          equipment: ['Pull-up Bar'] },

  // ─── LEGS ───────────────────────────────────────────────────────
  // Quads — bodyweight
  { name: 'Bodyweight Squat',        muscleGroup: 'Quads',     bodyParts: ['Legs','Full Body','Bodyweight'], equipment: [] },
  { name: 'Jump Squat',              muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Bulgarian Split Squat',   muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Lunge',                   muscleGroup: 'Quads',     bodyParts: ['Legs','Full Body','Bodyweight'], equipment: [] },
  { name: 'Reverse Lunge',           muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Wall Sit',                muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Step-Ups (chair)',        muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Skater Squat',            muscleGroup: 'Quads',     bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  // Quads — equipment
  { name: 'Barbell Squat',           muscleGroup: 'Quads',     bodyParts: ['Legs','Full Body'],              equipment: ['Barbell'] },
  { name: 'Goblet Squat',            muscleGroup: 'Quads',     bodyParts: ['Legs'],                          equipment: ['Kettlebell','Dumbbells'] },
  { name: 'Dumbbell Lunge',          muscleGroup: 'Quads',     bodyParts: ['Legs'],                          equipment: ['Dumbbells'] },
  { name: 'Band Squat',              muscleGroup: 'Quads',     bodyParts: ['Legs'],                          equipment: ['Resistance Bands'] },
  // Hamstrings — bodyweight
  { name: 'Glute Bridge',            muscleGroup: 'Hamstrings',bodyParts: ['Legs','Full Body','Bodyweight'], equipment: [] },
  { name: 'Single-Leg Glute Bridge', muscleGroup: 'Hamstrings',bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Good Mornings',           muscleGroup: 'Hamstrings',bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Nordic Curl (partner)',   muscleGroup: 'Hamstrings',bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  // Hamstrings — equipment
  { name: 'Romanian Deadlift',       muscleGroup: 'Hamstrings',bodyParts: ['Legs','Full Body'],              equipment: ['Barbell','Dumbbells'] },
  { name: 'Stiff-Leg Deadlift',      muscleGroup: 'Hamstrings',bodyParts: ['Legs'],                          equipment: ['Barbell','Dumbbells'] },
  { name: 'Kettlebell Swing',        muscleGroup: 'Hamstrings',bodyParts: ['Legs'],                          equipment: ['Kettlebell'] },
  { name: 'Band Hamstring Curl',     muscleGroup: 'Hamstrings',bodyParts: ['Legs'],                          equipment: ['Resistance Bands'] },
  // Calves — bodyweight
  { name: 'Standing Calf Raise',     muscleGroup: 'Calves',    bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Single-Leg Calf Raise',   muscleGroup: 'Calves',    bodyParts: ['Legs','Bodyweight'],             equipment: [] },
  { name: 'Jump Rope',               muscleGroup: 'Calves',    bodyParts: ['Legs','Cardio'],                 equipment: ['Jump Rope'] },
  { name: 'Pogo Jumps',              muscleGroup: 'Calves',    bodyParts: ['Legs','Bodyweight'],             equipment: [] },

  // ─── BODYWEIGHT (home-specific sessions) ─────────────────────────
  { name: 'Plank (45–60s)',          muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Side Plank',              muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Mountain Climbers',       muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Bicycle Crunches',        muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Leg Raises',              muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Russian Twists',          muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'Dead Bug',                muscleGroup: 'Core',      bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Hollow Hold',             muscleGroup: 'Core',      bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'V-Sit',                   muscleGroup: 'Core',      bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Ab Wheel Rollout',        muscleGroup: 'Core',      bodyParts: ['Bodyweight','Full Body'],        equipment: ['Foam Roller'] },
  { name: 'Burpees',                 muscleGroup: 'Cardio',    bodyParts: ['Bodyweight','Full Body'],        equipment: [] },
  { name: 'High Knees (30s)',        muscleGroup: 'Cardio',    bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Jumping Jacks',           muscleGroup: 'Cardio',    bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Skaters',                 muscleGroup: 'Cardio',    bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Star Jumps',              muscleGroup: 'Cardio',    bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Inchworms',               muscleGroup: 'Cardio',    bodyParts: ['Bodyweight'],                    equipment: [] },
  { name: 'Jump Rope (30s)',         muscleGroup: 'Cardio',    bodyParts: ['Bodyweight','Cardio'],           equipment: ['Jump Rope'] },
  { name: 'TRX Squat',               muscleGroup: 'Lower Body',bodyParts: ['Bodyweight'],                    equipment: ['TRX / Suspension Trainer'] },
  { name: 'TRX Push-Up',             muscleGroup: 'Upper Body',bodyParts: ['Bodyweight','Push'],             equipment: ['TRX / Suspension Trainer'] },
  { name: 'TRX Row',                 muscleGroup: 'Upper Body',bodyParts: ['Bodyweight','Pull'],             equipment: ['TRX / Suspension Trainer'] },
  { name: 'L-Sit Hold',              muscleGroup: 'Core',      bodyParts: ['Bodyweight'],                    equipment: ['Parallette Bars'] },
  { name: 'Parallette Push-Up',      muscleGroup: 'Upper Body',bodyParts: ['Bodyweight','Push'],             equipment: ['Parallette Bars'] },
  { name: 'Yoga Flow (sun salute)',  muscleGroup: 'Mobility',  bodyParts: ['Bodyweight'],                    equipment: ['Yoga Mat'] },
  { name: 'Hip Flexor Stretch',      muscleGroup: 'Mobility',  bodyParts: ['Bodyweight'],                    equipment: ['Yoga Mat'] },
  { name: 'Cat-Cow Stretch',         muscleGroup: 'Mobility',  bodyParts: ['Bodyweight'],                    equipment: ['Yoga Mat'] },

  // ─── CARDIO (gym machines) ────────────────────────────────────────
  { name: 'Treadmill Run',           muscleGroup: 'Cardio',    bodyParts: ['Cardio'],                        equipment: ['Cardio Machine'] },
  { name: 'Elliptical',              muscleGroup: 'Cardio',    bodyParts: ['Cardio'],                        equipment: ['Cardio Machine'] },
  { name: 'Stationary Bike',         muscleGroup: 'Cardio',    bodyParts: ['Cardio'],                        equipment: ['Cardio Machine'] },
  { name: 'Rowing Machine',          muscleGroup: 'Cardio',    bodyParts: ['Cardio'],                        equipment: ['Cardio Machine'] },
  { name: 'Running (track/street)',  muscleGroup: 'Cardio',    bodyParts: ['Cardio','Outdoor Cardio'],       equipment: [] },
  { name: 'Cycling (outdoor)',       muscleGroup: 'Cardio',    bodyParts: ['Cardio','Outdoor Cardio'],       equipment: [] },
  { name: 'HIIT Circuit',            muscleGroup: 'Cardio',    bodyParts: ['Cardio','Bodyweight'],           equipment: [] },
  { name: 'Jump Rope Intervals',     muscleGroup: 'Cardio',    bodyParts: ['Cardio'],                        equipment: ['Jump Rope'] },
];

/**
 * Returns exercises available to the user given their equipment list.
 * An exercise is available if it needs no equipment, OR the user has at
 * least one of the listed equipment items.
 */
export function filterByEquipment(
  exercises: ExerciseRecord[],
  userEquipment: string[]
): ExerciseRecord[] {
  return exercises.filter(
    (ex) => ex.equipment.length === 0 || ex.equipment.some((e) => userEquipment.includes(e))
  );
}

/**
 * Get exercises for a specific bodyPart, filtered by user equipment.
 * Returns a map of muscleGroup → exercise names[].
 * Picks up to `maxPerGroup` per muscle group.
 */
export function buildWorkoutExercises(
  bodyPart: string,
  userEquipment: string[],
  maxPerGroup = 6
): Record<string, string[]> {
  const available = filterByEquipment(
    EXERCISES.filter((ex) => ex.bodyParts.includes(bodyPart)),
    userEquipment
  );

  const grouped: Record<string, string[]> = {};
  for (const ex of available) {
    if (!grouped[ex.muscleGroup]) grouped[ex.muscleGroup] = [];
    if (grouped[ex.muscleGroup].length < maxPerGroup) {
      grouped[ex.muscleGroup].push(ex.name);
    }
  }

  return grouped;
}
