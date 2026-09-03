// lib/intellog/cohort.ts

export const MIN_COHORT_SAMPLE_SIZE = 20;

export function ageBucket(age: number): string {
  if (age < 25) return '<25';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

export function buildCohortKey(goalType: string | null, age: number): string {
  return `goal:${goalType ?? 'general'}|age:${ageBucket(age)}`;
}

export function computePercentiles(values: number[]): { p25: number; p50: number; p75: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);

  const percentile = (p: number): number => {
    const rank = p * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower];
    const weight = rank - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  return { p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75) };
}
