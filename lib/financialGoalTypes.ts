// lib/financialGoalTypes.ts

export const FINANCIAL_GOAL_TYPES = [
  { value: 'savings_target', label: 'Savings Target ($, by date)' },
  { value: 'spending_cap', label: 'Monthly Spending Cap ($, by category or total)' },
  { value: 'debt_payoff', label: 'Debt Payoff Target ($, by date)' },
  { value: 'investment_contribution', label: 'Investment Contribution Goal ($/month)' },
] as const;

export type FinancialGoalType = (typeof FINANCIAL_GOAL_TYPES)[number]['value'];
