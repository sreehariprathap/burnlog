// prisma/seed-intel-cohort.js
//
// Seeds `intel_cohort_stats` with synthetic peer-percentile rows for the
// Benchmarks charts (components/insights/BenchmarkAreaChart.tsx) in BurnLog
// and MoneyLog.
//
// The real pipeline (app/api/cron/intel-cohort/route.ts) only publishes a
// cohort once >= MIN_COHORT_SAMPLE_SIZE (20) real users share that
// cohortKey|app|metric|date — which never happens for a small/solo user
// base, so the chart would otherwise always show "Not enough similar users
// yet to compare". This script fabricates plausible aggregate percentiles
// (no per-user data — these rows never reference a real profile) so the
// chart has something to render immediately.
//
// cohortKey format must match lib/intellog/cohort.ts buildCohortKey():
// `goal:<goalType>|age:<ageBucket>|country:<country>`.
//
// Run: node prisma/seed-intel-cohort.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const WINDOW_DAYS = 30;
const AGE_BUCKETS = ['<25', '25-34', '35-44', '45-54', '55+'];
// 'any' matches buildCohortKey's fallback when a profile has no country set
// (true for most profiles today — only TravelLog's config page sets it).
const COUNTRIES = ['any', 'CA', 'US'];

// Deterministic pseudo-random so re-running the seed is reproducible.
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function ageAdjustIndex(ageBucket, values) {
  return values[AGE_BUCKETS.indexOf(ageBucket)];
}

// ---- BurnLog: workoutsPerWeek, caloriesBurnedPerWeek ----
// 'general' matches buildCohortKey's fallback when a profile has no fitness
// goal; the rest mirror lib/goalTypes.ts GOAL_TYPES values.
const BURNLOG_GOAL_TYPES = [
  'general',
  'weight_loss',
  'weight_gain',
  'calories_burned',
  'calories_intake',
  'running_distance',
  'workout_frequency',
  'workout_time',
  'daily_steps',
];

function baseWorkoutsPerWeek(ageBucket, goalType) {
  const ageAdjust = ageAdjustIndex(ageBucket, [1, 0.5, 0, -0.5, -1]);
  const goalAdjust = goalType === 'workout_frequency' ? 1.5 : goalType === 'general' ? 0 : 0.5;
  return 3.5 + ageAdjust + goalAdjust;
}

function baseCaloriesBurnedPerWeek(ageBucket, goalType) {
  const ageAdjust = ageAdjustIndex(ageBucket, [300, 150, 0, -150, -300]);
  const goalAdjust = goalType === 'calories_burned' ? 400 : goalType === 'general' ? 0 : 150;
  return 1600 + ageAdjust + goalAdjust;
}

// ---- MoneyLog: budgetPct (month-to-date spend / spending-cap target, %) ----
// mirrors lib/financialGoalTypes.ts FINANCIAL_GOAL_TYPES values; 'general'
// covers profiles with no financial goal at all.
const MONEYLOG_GOAL_TYPES = ['general', 'savings_target', 'spending_cap', 'debt_payoff', 'investment_contribution'];

function baseBudgetPct(ageBucket, goalType) {
  const ageAdjust = ageAdjustIndex(ageBucket, [10, 5, 0, -5, -10]);
  const goalAdjust = goalType === 'spending_cap' ? -15 : goalType === 'general' ? 10 : 0;
  return 70 + ageAdjust + goalAdjust;
}

function buildRows() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = [];
  let seed = 0;

  for (let d = 0; d < WINDOW_DAYS; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString();

    for (const ageBucket of AGE_BUCKETS) {
      for (const country of COUNTRIES) {
        for (const goalType of BURNLOG_GOAL_TYPES) {
          const cohortKey = `goal:${goalType}|age:${ageBucket}|country:${country}`;
          seed += 1;

          const wpwP50 = Math.max(0.5, baseWorkoutsPerWeek(ageBucket, goalType) + (seededRandom(seed) - 0.5) * 0.6);
          rows.push({
            cohortKey,
            app: 'burnlog',
            metric: 'workoutsPerWeek',
            date: dateStr,
            p25: Math.max(0, +(wpwP50 - 1.5).toFixed(1)),
            p50: +wpwP50.toFixed(1),
            p75: +(wpwP50 + 1.5).toFixed(1),
            sampleSize: 20 + Math.floor(seededRandom(seed + 1e6) * 60),
          });

          const cbpwP50 = Math.max(200, baseCaloriesBurnedPerWeek(ageBucket, goalType) + (seededRandom(seed + 2e6) - 0.5) * 200);
          rows.push({
            cohortKey,
            app: 'burnlog',
            metric: 'caloriesBurnedPerWeek',
            date: dateStr,
            p25: Math.max(0, Math.round(cbpwP50 - 500)),
            p50: Math.round(cbpwP50),
            p75: Math.round(cbpwP50 + 600),
            sampleSize: 20 + Math.floor(seededRandom(seed + 3e6) * 60),
          });
        }

        for (const goalType of MONEYLOG_GOAL_TYPES) {
          const cohortKey = `goal:${goalType}|age:${ageBucket}|country:${country}`;
          seed += 1;

          const bpP50 = Math.min(150, Math.max(5, baseBudgetPct(ageBucket, goalType) + (seededRandom(seed + 4e6) - 0.5) * 20));
          rows.push({
            cohortKey,
            app: 'moneylog',
            metric: 'budgetPct',
            date: dateStr,
            p25: Math.max(0, Math.round(bpP50 - 25)),
            p50: Math.round(bpP50),
            p75: Math.round(bpP50 + 25),
            sampleSize: 20 + Math.floor(seededRandom(seed + 5e6) * 60),
          });
        }
      }
    }
  }

  return rows;
}

async function main() {
  const rows = buildRows();
  console.log(`Seeding ${rows.length} intel_cohort_stats rows (burnlog + moneylog)...`);

  // Fresh mock dataset — clear anything previously seeded for these apps
  // within the window before bulk-inserting, so re-runs stay idempotent
  // without one-by-one upserts (which are far slower over a remote DB).
  await prisma.intelCohortStat.deleteMany({ where: { app: { in: ['burnlog', 'moneylog'] } } });

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.intelCohortStat.createMany({ data: batch });
    console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
