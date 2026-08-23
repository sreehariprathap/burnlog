// lib/financeGoalProgress.ts
import type { FinanceLineItem } from './financePeriods';

export interface FinancialGoalRow {
  id: string;
  goalType: string;
  label: string;
  category: string | null;
  targetValue: number;
  targetDate: string | null;
  createdAt: string;
}

function clampPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

export function computeGoalProgress(
  goal: FinancialGoalRow,
  itemsSinceGoalCreation: FinanceLineItem[],
  itemsThisCalendarMonth: FinanceLineItem[]
): { current: number; target: number; pct: number } {
  switch (goal.goalType) {
    case 'savings_target': {
      const income = itemsSinceGoalCreation
        .filter((i) => i.type === 'income')
        .reduce((sum, i) => sum + i.amount, 0);
      const expense = itemsSinceGoalCreation
        .filter((i) => i.type === 'expense')
        .reduce((sum, i) => sum + i.amount, 0);
      const current = Math.max(0, income - expense);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'spending_cap': {
      const current = itemsThisCalendarMonth
        .filter((i) => i.type === 'expense' && (!goal.category || i.category === goal.category))
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'debt_payoff': {
      const current = itemsSinceGoalCreation
        .filter((i) => i.type === 'expense' && i.category === 'debt_payment')
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    case 'investment_contribution': {
      const current = itemsThisCalendarMonth
        .filter((i) => i.type === 'expense' && i.category === 'investment_contribution')
        .reduce((sum, i) => sum + i.amount, 0);
      return { current, target: goal.targetValue, pct: clampPct(current, goal.targetValue) };
    }
    default:
      return { current: 0, target: goal.targetValue, pct: 0 };
  }
}
