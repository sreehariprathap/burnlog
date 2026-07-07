// lib/exerciseInstructions.ts

/**
 * Standard form cues per exercise/activity name, shown in the exercise info
 * modal. Keys must match the exact strings used in the session-loggers'
 * exercise lists. Anything not listed falls back to a generic message.
 */
const EXERCISE_INSTRUCTIONS: Record<string, string[]> = {
  // Push - Chest
  'Bench Press': [
    'Lie on the bench with eyes under the bar, feet flat on the floor.',
    'Grip the bar just wider than shoulder-width.',
    'Lower the bar to mid-chest, then press up to full arm extension.',
  ],
  'Incline Press': [
    'Set the bench to a 30-45 degree incline.',
    'Lower the bar or dumbbells to the upper chest.',
    'Press up and slightly back, squeezing the chest at the top.',
  ],
  'Push Ups': [
    'Hands slightly wider than shoulders, body in a straight line.',
    'Lower your chest to just above the floor, elbows at ~45 degrees.',
    'Push back up to full extension without letting hips sag.',
  ],
  'Push-Ups': [
    'Hands slightly wider than shoulders, body in a straight line.',
    'Lower your chest to just above the floor, elbows at ~45 degrees.',
    'Push back up to full extension without letting hips sag.',
  ],
  'Chest Fly': [
    'Lie on a bench holding dumbbells above your chest, slight elbow bend.',
    'Lower the weights out to the sides in an arc until you feel a stretch.',
    'Bring them back together over your chest, squeezing the pecs.',
  ],
  'Dips': [
    'Support yourself on parallel bars, arms straight.',
    'Lower your body by bending the elbows, leaning slightly forward for chest emphasis.',
    'Press back up to full arm extension.',
  ],
  'Dip': [
    'Support yourself on parallel bars, arms straight.',
    'Lower your body by bending the elbows, leaning slightly forward for chest emphasis.',
    'Press back up to full arm extension.',
  ],
  'Decline Press': [
    'Lie on a decline bench, feet secured.',
    'Lower the bar to the lower chest.',
    'Press up to full extension, keeping shoulders back.',
  ],

  // Push - Shoulders
  'Overhead Press': [
    'Stand with the bar at shoulder height, grip just outside shoulders.',
    'Brace your core and press the bar straight overhead.',
    'Lower back to shoulder height with control.',
  ],
  'Lateral Raise': [
    'Stand holding dumbbells at your sides, slight bend in the elbows.',
    'Raise your arms out to the sides until roughly shoulder height.',
    'Lower with control - avoid using momentum.',
  ],
  'Front Raise': [
    'Stand holding dumbbells in front of your thighs.',
    'Raise one or both arms forward to shoulder height.',
    'Lower with control back to the start.',
  ],
  'Reverse Fly': [
    'Hinge forward at the hips with a flat back, dumbbells hanging down.',
    'Raise your arms out to the sides, squeezing the shoulder blades together.',
    'Lower with control back to the start.',
  ],
  'Upright Row': [
    'Hold the bar in front of your thighs, hands close together.',
    'Pull the bar straight up along your body to chest height, elbows leading.',
    'Lower with control back to the start.',
  ],

  // Push - Triceps
  'Pushdown': [
    'Stand at a cable machine, grip the bar or rope at chest height.',
    'Keep elbows pinned to your sides and push the attachment down to full extension.',
    'Return with control without letting elbows drift forward.',
  ],
  'Overhead Extension': [
    'Hold a dumbbell or bar overhead with both hands.',
    'Lower it behind your head by bending the elbows.',
    'Extend back up to full arm extension.',
  ],
  'Skull Crushers': [
    'Lie on a bench holding a bar or dumbbells above your chest.',
    'Bend the elbows to lower the weight toward your forehead.',
    'Extend back up, keeping upper arms still throughout.',
  ],
  'Close Grip Bench Press': [
    'Lie on the bench with hands shoulder-width apart or closer.',
    'Lower the bar to your lower chest, elbows tracking close to the body.',
    'Press up to full extension, emphasizing the triceps.',
  ],

  // Pull - Back
  'Pull-Ups': [
    'Hang from the bar with an overhand grip, slightly wider than shoulders.',
    'Pull your chin above the bar, driving your elbows down and back.',
    'Lower with control to a full hang.',
  ],
  'Bent-over Row': [
    'Hinge at the hips with a flat back, bar or dumbbells hanging down.',
    'Pull the weight to your lower ribs, squeezing the shoulder blades.',
    'Lower with control back to the start.',
  ],
  'Lat Pulldown': [
    'Sit at the machine, grip the bar wider than shoulder-width.',
    'Pull the bar down to your upper chest, driving elbows down.',
    'Let it rise back with control, arms fully extended.',
  ],
  'Seated Row': [
    'Sit at the machine, grip the handle with arms extended.',
    'Pull the handle to your torso, squeezing the shoulder blades together.',
    'Extend back out with control.',
  ],
  'Deadlift': [
    'Stand with the bar over mid-foot, feet hip-width apart.',
    'Hinge down and grip the bar, chest up, back flat.',
    'Drive through the floor to stand tall, then lower with control.',
  ],
  'Row': [
    'Hinge at the hips with a flat back, weight hanging down.',
    'Pull the weight to your torso, squeezing the shoulder blades.',
    'Lower with control back to the start.',
  ],
  'Face Pull': [
    'Set a cable at head height with a rope attachment.',
    'Pull the rope toward your face, flaring elbows out wide.',
    'Return with control, keeping tension throughout.',
  ],

  // Pull - Biceps
  'Barbell Curl': [
    'Stand holding the bar with an underhand grip, elbows at your sides.',
    'Curl the bar up toward your shoulders without swinging.',
    'Lower with control back to full extension.',
  ],
  'Hammer Curl': [
    'Hold dumbbells with a neutral (palms-in) grip at your sides.',
    'Curl up while keeping the neutral grip throughout.',
    'Lower with control back to the start.',
  ],
  'Preacher Curl': [
    'Rest your upper arms on the preacher bench pad.',
    'Curl the weight up while keeping your arms pinned to the pad.',
    'Lower with control to full extension.',
  ],
  'Concentration Curl': [
    'Sit and rest your elbow against your inner thigh.',
    'Curl the dumbbell up toward your shoulder.',
    'Lower with control back to the start.',
  ],
  'Cable Curl': [
    'Stand facing a low cable pulley, grip the bar with an underhand grip.',
    'Curl the bar up toward your shoulders, elbows pinned to your sides.',
    'Lower with control back to the start.',
  ],
  'Curl': [
    'Hold the weight with an underhand grip, elbows at your sides.',
    'Curl up toward your shoulders without swinging.',
    'Lower with control back to full extension.',
  ],

  // Pull - Forearms
  'Wrist Curl': [
    'Rest your forearms on your thighs or a bench, palms up.',
    'Curl the weight up using only your wrists.',
    'Lower with control past neutral to stretch the forearms.',
  ],
  'Reverse Curl': [
    'Hold the bar with an overhand grip, elbows at your sides.',
    'Curl the bar up toward your shoulders keeping the overhand grip.',
    'Lower with control back to the start.',
  ],
  "Farmer's Walk": [
    'Pick up a heavy dumbbell or kettlebell in each hand.',
    'Stand tall, shoulders back, and walk for the target distance or time.',
    'Set down with control - avoid rounding your back.',
  ],
  'Plate Pinch': [
    'Pinch two weight plates together, smooth sides out, using your fingertips.',
    'Hold for time, keeping your arm relaxed at your side.',
    'Set down with control when grip fatigues.',
  ],
  'Grip Trainer': [
    'Hold the grip trainer in one hand.',
    'Squeeze the handles together as far as you can.',
    'Release with control and repeat.',
  ],

  // Legs - Quads
  'Squat': [
    'Stand with feet shoulder-width apart, bar across your upper back (or bodyweight).',
    'Bend your knees and hips to lower until thighs are roughly parallel to the floor.',
    'Drive through your heels to stand back up.',
  ],
  'Leg Press': [
    'Sit in the machine with feet shoulder-width apart on the platform.',
    'Lower the platform by bending your knees toward your chest.',
    'Press back up without locking your knees out hard.',
  ],
  'Lunge': [
    'Step forward with one leg, lowering your hips until both knees are ~90 degrees.',
    'Keep your front knee over your ankle, not past your toes.',
    'Push back to standing and repeat on the other side.',
  ],
  'Lunges': [
    'Step forward with one leg, lowering your hips until both knees are ~90 degrees.',
    'Keep your front knee over your ankle, not past your toes.',
    'Push back to standing and repeat on the other side.',
  ],
  'Leg Extension': [
    'Sit in the machine with the pad resting on your lower shins.',
    'Extend your legs to straighten your knees fully.',
    'Lower with control back to the start.',
  ],
  'Hack Squat': [
    'Position yourself on the machine with shoulders under the pads, feet shoulder-width.',
    'Lower by bending your knees until thighs are roughly parallel to the platform.',
    'Press back up through your heels.',
  ],

  // Legs - Hamstrings
  'Leg Curl': [
    'Lie face down (or seated) with the pad resting on your lower legs.',
    'Curl your heels toward your glutes.',
    'Lower with control back to the start.',
  ],
  'Good Morning': [
    'Rest a bar across your upper back, feet hip-width apart.',
    'Hinge at the hips, keeping a flat back, until your torso is near parallel to the floor.',
    'Drive your hips forward to stand back up.',
  ],
  'Romanian Deadlift': [
    'Hold the bar in front of your thighs, feet hip-width apart.',
    'Hinge at the hips, pushing them back while keeping knees softly bent.',
    'Lower until you feel a hamstring stretch, then drive hips forward to stand.',
  ],
  'Glute Bridge': [
    'Lie on your back, knees bent, feet flat on the floor.',
    'Drive through your heels to lift your hips until your body forms a straight line.',
    'Lower with control back to the start.',
  ],

  // Legs - Calves
  'Standing Calf Raise': [
    'Stand on the edge of a step or machine platform, balls of feet down.',
    'Rise up onto your toes as high as possible.',
    'Lower your heels below the step for a full stretch, then repeat.',
  ],
  'Seated Calf Raise': [
    'Sit at the machine with the pad resting on your lower thighs, balls of feet on the platform.',
    'Rise up onto your toes as high as possible.',
    'Lower with control for a full stretch, then repeat.',
  ],
  'Donkey Calf Raise': [
    'Bend forward at the hips on the machine, balls of feet on the platform.',
    'Rise up onto your toes as high as possible.',
    'Lower with control for a full stretch, then repeat.',
  ],
  'Leg Press Calf Raise': [
    'Sit in the leg press with only the balls of your feet on the platform.',
    'Press the platform away by extending your ankles.',
    'Return with control for a full stretch, then repeat.',
  ],
  'Jump Rope': [
    'Hold the rope handles at hip height, wrists doing most of the work.',
    'Jump just high enough to clear the rope as it passes underfoot.',
    'Keep a steady rhythm and land softly on the balls of your feet.',
  ],

  // Full Body extras
  'Tricep Extension': [
    'Hold a dumbbell or bar overhead with both hands.',
    'Lower it behind your head by bending the elbows.',
    'Extend back up to full arm extension.',
  ],
  'Close-Grip Push Up': [
    'Place your hands close together, roughly shoulder-width or narrower.',
    'Lower your chest toward your hands, elbows tracking close to your body.',
    'Push back up to full extension.',
  ],
  'Calf Raise': [
    'Stand with the balls of your feet on a raised surface or flat ground.',
    'Rise up onto your toes as high as possible.',
    'Lower your heels for a full stretch, then repeat.',
  ],
  'Plank': [
    'Support yourself on your forearms and toes, body in a straight line.',
    'Brace your core and keep your hips level - don\'t let them sag or pike up.',
    'Hold for time, breathing steadily.',
  ],
  'Crunch': [
    'Lie on your back, knees bent, feet flat on the floor.',
    'Curl your shoulders up off the floor, engaging your abs.',
    'Lower with control back to the start.',
  ],
  'Russian Twist': [
    'Sit with knees bent, leaning back slightly, feet lifted or grounded.',
    'Rotate your torso to bring your hands (or a weight) to one side.',
    'Rotate through to the other side, keeping your core braced.',
  ],

  // Cardio
  'Running': [
    'Warm up with a few minutes of easy walking or jogging.',
    'Maintain a steady pace you can sustain for the full duration.',
    'Cool down with a slower pace for the last few minutes.',
  ],
  'Cycling': [
    'Adjust the seat so your knee has a slight bend at full pedal extension.',
    'Maintain a steady cadence at a challenging but sustainable resistance.',
    'Cool down with light pedaling for the last few minutes.',
  ],
  'Rowing': [
    'Drive with your legs first, then lean back slightly, then pull the handle to your chest.',
    'Reverse the sequence smoothly on the way back: arms, then torso, then legs.',
    'Keep a steady, sustainable stroke rate throughout.',
  ],
  'Elliptical': [
    'Stand tall on the pedals, holding the handles lightly.',
    'Maintain a steady stride and resistance you can sustain for the full duration.',
    'Cool down by easing the pace for the last few minutes.',
  ],
  'Other': [
    'Choose any cardio activity you enjoy - swimming, stairs, sports, etc.',
    'Keep your heart rate elevated for the target duration.',
    'Cool down gradually at the end.',
  ],
};

const DEFAULT_INSTRUCTIONS = [
  'Instructions for this exercise are coming soon.',
  'Focus on controlled form and a comfortable range of motion.',
];

export function getExerciseInstructions(exerciseName: string): string[] {
  return EXERCISE_INSTRUCTIONS[exerciseName] ?? DEFAULT_INSTRUCTIONS;
}
