// lib/homelog/expenseBalances.ts

export interface ExpenseForBalance {
  paidByProfileId: string;
  splits: { profileId: string; shareAmount: number }[];
}

export interface SettlementForBalance {
  fromProfileId: string;
  toProfileId: string;
  amount: number;
}

export interface PairBalance {
  memberA: string;
  memberB: string;
  /** positive => memberA owes memberB this amount; negative => memberB owes memberA */
  net: number;
}

/**
 * owes[ower][owed] = cumulative amount `ower` owes `owed`, before netting the
 * two directions against each other for the final pairwise result.
 */
export function computeBalances(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[]
): PairBalance[] {
  const owes = new Map<string, Map<string, number>>();

  function add(ower: string, owed: string, amount: number) {
    if (!owes.has(ower)) owes.set(ower, new Map());
    const inner = owes.get(ower)!;
    inner.set(owed, (inner.get(owed) ?? 0) + amount);
  }

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.profileId === expense.paidByProfileId) continue;
      add(split.profileId, expense.paidByProfileId, split.shareAmount);
    }
  }

  for (const settlement of settlements) {
    add(settlement.fromProfileId, settlement.toProfileId, -settlement.amount);
  }

  const pairs = new Map<string, PairBalance>();

  function pairKey(a: string, b: string): string {
    return [a, b].sort().join('|');
  }

  const allOwers = new Set<string>();
  for (const [ower, inner] of owes) {
    allOwers.add(ower);
    for (const owed of inner.keys()) allOwers.add(owed);
  }

  for (const a of allOwers) {
    for (const b of allOwers) {
      if (a >= b) continue;
      const key = pairKey(a, b);
      if (pairs.has(key)) continue;

      const aOwesB = owes.get(a)?.get(b) ?? 0;
      const bOwesA = owes.get(b)?.get(a) ?? 0;
      const net = aOwesB - bOwesA;

      if (Math.abs(net) < 0.005) continue;
      pairs.set(key, { memberA: a, memberB: b, net });
    }
  }

  return [...pairs.values()];
}
