// Reddit's "hot" ranking formula: a log-scaled vote score plus a linear
// time-decay term. The epoch offset (seconds since 2005-12-08, reddit's own
// reference point) only has to be a fixed constant shared by every post —
// it doesn't need to mean anything for this app, it just keeps the time
// term from producing enormous numbers.
const EPOCH_OFFSET_SECONDS = 1134028003;

export function hotScore(score: number, createdAt: string | Date): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = new Date(createdAt).getTime() / 1000 - EPOCH_OFFSET_SECONDS;
  return sign * order + seconds / 45000;
}
