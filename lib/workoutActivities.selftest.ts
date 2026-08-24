// lib/workoutActivities.selftest.ts
export {};

async function main() {
  const { COMMON_ACTIVITIES, formatWorkoutNotes } = await import('./workoutActivities');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  assert(COMMON_ACTIVITIES.length >= 10, 'COMMON_ACTIVITIES has a broad set of options');
  assert(COMMON_ACTIVITIES[COMMON_ACTIVITIES.length - 1] === 'Other', 'Other is always the last option');
  assert(COMMON_ACTIVITIES.includes('Running'), 'includes Running');
  assert(COMMON_ACTIVITIES.includes('Swimming'), 'includes Swimming');
  assert(COMMON_ACTIVITIES.includes('Badminton'), 'includes Badminton');
  assert(COMMON_ACTIVITIES.includes('Soccer'), 'includes Soccer');
  assert(new Set(COMMON_ACTIVITIES).size === COMMON_ACTIVITIES.length, 'no duplicate activities');

  assert(formatWorkoutNotes(undefined, undefined) === null, 'no distance/description -> null');
  assert(formatWorkoutNotes(5.2, undefined) === 'Distance: 5.2 km', 'distance only');
  assert(formatWorkoutNotes(undefined, 'Played pickup basketball') === 'Played pickup basketball', 'description only');
  assert(
    formatWorkoutNotes(3, 'Backyard obstacle course') === 'Distance: 3 km\nBackyard obstacle course',
    'distance and description combine with a newline'
  );
  assert(formatWorkoutNotes(0, undefined) === null, 'zero distance is treated as absent');
  assert(formatWorkoutNotes(undefined, '   ') === null, 'whitespace-only description is treated as absent');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll workoutActivities assertions passed');
}

main();
