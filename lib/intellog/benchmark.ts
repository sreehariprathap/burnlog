// lib/intellog/benchmark.ts

export type OwnPoint = { date: string; value: number };
export type CohortPoint = { date: string; p25: number; p50: number; p75: number };

export type BenchmarkPoint = {
  date: string;
  own: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
};

/**
 * Merges a profile's own metric history with the matching cohort
 * percentiles into one date-sorted series for the vs-peers chart. A date
 * present on only one side still produces a row, with the other side's
 * fields null (the chart renders a gap rather than dropping the point).
 */
export function mergeBenchmarkSeries(own: OwnPoint[], cohort: CohortPoint[]): BenchmarkPoint[] {
  const ownByDate = new Map(own.map((o) => [o.date, o.value]));
  const cohortByDate = new Map(cohort.map((c) => [c.date, c]));
  const dates = Array.from(new Set([...ownByDate.keys(), ...cohortByDate.keys()])).sort();

  return dates.map((date) => {
    const cohortPoint = cohortByDate.get(date);
    return {
      date,
      own: ownByDate.get(date) ?? null,
      p25: cohortPoint?.p25 ?? null,
      p50: cohortPoint?.p50 ?? null,
      p75: cohortPoint?.p75 ?? null,
    };
  });
}
