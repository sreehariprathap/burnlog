import { describe, it, expect } from 'vitest';
import { computeSpendable } from './spendable';
import type { RecurringItemRow } from '../financePeriods';

const periodStart = new Date(2026, 2, 2); // Mon Mar 2, 2026
const periodEnd = new Date(2026, 2, 8); // Sun Mar 8, 2026

function recurringItem(overrides: Partial<RecurringItemRow>): RecurringItemRow {
  return {
    id: 'r1', type: 'income', category: 'salary', label: 'Salary', amount: 0,
    frequency: 'weekly', dayOfWeek: null, dayOfMonth: null, monthOfYear: null,
    anchorDate: null, secondDayOfMonth: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
    ...overrides,
  };
}

describe('computeSpendable', () => {
  it('computes spendable as projected income minus bills minus bucket contributions', () => {
    const result = computeSpendable({
      recurringItems: [
        recurringItem({ id: 'income1', type: 'income', category: 'salary', amount: 1000, frequency: 'weekly', dayOfWeek: 3 }), // Wed, in range
        recurringItem({ id: 'bill1', type: 'expense', category: 'rent', amount: 200, frequency: 'weekly', dayOfWeek: 4 }), // Thu, in range
      ],
      periodStart,
      periodEnd,
      loggedExpenses: [{ amount: 50, date: new Date(2026, 2, 3).toISOString() }],
      bucketContributions: [{ amount: 100, createdAt: new Date(2026, 2, 3).toISOString() }],
    });

    expect(result.projectedIncome).toBe(1000);
    expect(result.projectedBills).toBe(200);
    expect(result.bucketContributions).toBe(100);
    expect(result.spendable).toBe(700); // 1000 - 200 - 100
    expect(result.spentSoFar).toBe(50);
    expect(result.remaining).toBe(650); // 700 - 50
  });

  it('excludes bucket contributions and expenses logged outside the period', () => {
    const result = computeSpendable({
      recurringItems: [],
      periodStart,
      periodEnd,
      loggedExpenses: [{ amount: 999, date: new Date(2026, 2, 20).toISOString() }],
      bucketContributions: [{ amount: 999, createdAt: new Date(2026, 2, 20).toISOString() }],
    });
    expect(result.spentSoFar).toBe(0);
    expect(result.bucketContributions).toBe(0);
  });
});
