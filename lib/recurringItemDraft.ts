// lib/recurringItemDraft.ts

export interface RecurringItemDraft {
  type: 'income' | 'expense';
  category: string;
  label: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'semimonthly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  anchorDate: string | null;
  secondDayOfMonth: number | null;
}
