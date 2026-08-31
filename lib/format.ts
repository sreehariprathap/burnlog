// lib/format.ts

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatCalories(kcal: number): string {
  return `${Math.round(kcal).toLocaleString("en-IN")} kcal`;
}

/** Formats decimal hours (e.g. 7.5) as "7h 30m". */
export function formatDurationHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const RELATIVE_UNITS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * "2 hours ago" / "Yesterday" for recent timestamps; falls back to an
 * absolute date once the gap exceeds a week.
 */
export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  let diffSeconds = diffMs / 1000;

  if (Math.abs(diffSeconds) < 1) return "just now";

  for (const [unitLimit, unit] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) < unitLimit) {
      return relativeFormatter.format(Math.round(diffSeconds), unit);
    }
    diffSeconds /= unitLimit;
  }

  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
