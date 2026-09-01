// lib/moneylog/balance.ts
import type { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

/**
 * A profile's wallet balance — not stored, computed on demand as
 * sum(income) - sum(expense) over finance_transactions. This is the same
 * math NetSummaryCard uses for its period-scoped "Net" figure, just
 * unscoped (all-time) here since a payment balance isn't a reporting period.
 */
export async function getBalance(admin: Admin, profileId: string): Promise<number> {
  const { data, error } = await admin
    .from('finance_transactions')
    .select('type, amount')
    .eq('profileId', profileId);

  if (error) throw new Error(error.message);

  let balance = 0;
  for (const row of (data ?? []) as { type: string; amount: number }[]) {
    balance += row.type === 'income' ? row.amount : -row.amount;
  }
  return balance;
}
