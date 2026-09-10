// lib/moneylog/spendable.ts
//
// "How much can I spend this period" = projected recurring income minus
// projected recurring bills minus bucket contributions logged this period,
// against actual expenses logged this period. See the design doc's
// "Spendable-this-period tracker" section.
import { expandRecurringInRange } from '../financePeriods';
import type { RecurringItemRow } from '../financePeriods';

export interface SpendableInput {
  recurringItems: RecurringItemRow[];
  periodStart: Date;
  periodEnd: Date;
  loggedExpenses: { amount: number; date: string }[];
  bucketContributions: { amount: number; createdAt: string }[];
}

export interface SpendableResult {
  projectedIncome: number;
  projectedBills: number;
  bucketContributions: number;
  spendable: number;
  spentSoFar: number;
  remaining: number;
}

function inRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function computeSpendable(input: SpendableInput): SpendableResult {
  const projected = expandRecurringInRange(input.recurringItems, input.periodStart, input.periodEnd);
  const projectedIncome = projected.filter((p) => p.type === 'income').reduce((sum, p) => sum + p.amount, 0);
  const projectedBills = projected.filter((p) => p.type === 'expense').reduce((sum, p) => sum + p.amount, 0);

  const bucketContributions = input.bucketContributions
    .filter((c) => inRange(c.createdAt, input.periodStart, input.periodEnd))
    .reduce((sum, c) => sum + c.amount, 0);

  const spentSoFar = input.loggedExpenses
    .filter((e) => inRange(e.date, input.periodStart, input.periodEnd))
    .reduce((sum, e) => sum + e.amount, 0);

  const spendable = projectedIncome - projectedBills - bucketContributions;

  return {
    projectedIncome,
    projectedBills,
    bucketContributions,
    spendable,
    spentSoFar,
    remaining: spendable - spentSoFar,
  };
}
