// lib/financeCategories.ts

export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Salary' },
  { value: 'freelance', label: 'Freelance / Business' },
  { value: 'investment_returns', label: 'Investment Returns' },
  { value: 'other_income', label: 'Other Income' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent / Mortgage' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'mobile_bill', label: 'Mobile / Internet' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'debt_payment', label: 'Debt Payment' },
  { value: 'investment_contribution', label: 'Investment Contribution' },
  { value: 'other_expense', label: 'Other' },
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]['value'];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];

export function categoryLabel(category: string): string {
  const match = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find((c) => c.value === category);
  return match ? match.label : category;
}
