# HomeLog — Shared Expenses & Bill-Splitting — Design (Sub-Project 4)

**Date:** 2026-08-25
**Status:** Approved design, pending spec review
**Depends on:** Household foundation (`2026-08-25-homelog-household-foundation-design.md`).

## Goal

Log a shared cost, split it across chosen members with custom amounts, and see a running "who owes whom" balance with a way to record a settle-up.

## Decisions (locked during brainstorming)

1. **Custom splits:** the payer specifies each included member's exact share amount (not just equal division) — shares must sum to the total.
2. **Settlement:** balances are computed live from expenses minus recorded settlements; a "Settle up" action inserts a settlement row reducing (not necessarily zeroing) the pairwise balance — no real payment processing.
3. **No debt-simplification algorithm** — balances are shown pairwise (per pair of members), not netted across the whole household via a minimal-transactions algorithm. Simpler to reason about and implement; a household of a few people doesn't need graph-minimization.
4. **API-route mediated**, consistent with the rest of HomeLog.

## Data model

```prisma
model HouseholdExpense {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household     Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId   String   @db.Uuid
  paidByProfileId String @db.Uuid
  paidByProfile Profile  @relation("ExpensePaidBy", fields: [paidByProfileId], references: [id])
  label         String
  category      String   // 'rent' | 'utilities' | 'groceries' | 'other'
  totalAmount   Float
  date          DateTime @default(now())
  createdAt     DateTime @default(now())
  splits        HouseholdExpenseSplit[]

  @@map("household_expenses")
}

model HouseholdExpenseSplit {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  expense    HouseholdExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  expenseId  String  @db.Uuid
  profileId  String  @db.Uuid
  profile    Profile @relation("ExpenseSplitOwed", fields: [profileId], references: [id])
  shareAmount Float

  @@map("household_expense_splits")
}

model HouseholdSettlement {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  household     Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  householdId   String   @db.Uuid
  fromProfileId String   @db.Uuid // the one who owed and is now paying
  fromProfile   Profile  @relation("SettlementFrom", fields: [fromProfileId], references: [id])
  toProfileId   String   @db.Uuid // the one who was owed
  toProfile     Profile  @relation("SettlementTo", fields: [toProfileId], references: [id])
  amount        Float
  settledAt     DateTime @default(now())

  @@map("household_settlements")
}
```

Note: `splits` include the payer's own share too (so `sum(splits.shareAmount) === totalAmount` always holds) — the payer's own split row just means "money they spent on themselves," not a debt.

## Balance computation — `lib/homelog/expenseBalances.ts`

```ts
export interface PairBalance {
  memberA: string; // profileId
  memberB: string;
  // positive => memberA owes memberB this amount; negative => memberB owes memberA
  net: number;
}

export function computeBalances(
  expenses: { paidByProfileId: string; splits: { profileId: string; shareAmount: number }[] }[],
  settlements: { fromProfileId: string; toProfileId: string; amount: number }[]
): PairBalance[]
```

For each expense, every split row where `profileId !== paidByProfileId` adds `shareAmount` to a `owes[splitProfileId][payerProfileId]` ledger. Each settlement subtracts `amount` from `owes[fromProfileId][toProfileId]`. Final pairwise net for any two members A/B is `owes[A][B] - owes[B][A]`, collapsed into one signed `PairBalance` per unordered pair (zero-balance pairs omitted from the result).

## API routes (`app/api/homelog/expenses/*`, `app/api/homelog/settlements/*`, service-role)

- `GET /api/homelog/expenses` — my household's expenses with splits (member names joined server-side), newest first.
- `POST /api/homelog/expenses` — `{ label, category, totalAmount, splits: [{ profileId, shareAmount }] }`. Validates `splits` sum equals `totalAmount` (float tolerance 0.01) and every `profileId` is a current household member.
- `DELETE /api/homelog/expenses/[id]` — payer-only.
- `GET /api/homelog/balances` — runs `computeBalances` over the household's expenses + settlements, returns pairwise balances with member names attached.
- `POST /api/homelog/settlements` — `{ toProfileId, amount }` (from = caller). Validates `amount > 0`.

## Page — `/homelog/bills`

New "Bills" tab in `HomeLogBottomNav` (`Home | Chores | Inventory | Bills`). Two sections:
- **Balances:** one row per nonzero pairwise balance involving me ("You owe Sam $18" / "Alex owes you $42"), each with a "Settle up" button pre-filled with that amount.
- **Recent expenses:** list (label, payer, total, date), "+ Add expense" form — label/category/total, then a per-member share input for each current household member, live-validated to sum to the total before submit is enabled.

## Testing

Manual, two accounts: A logs a $60 dinner split $40/$20 (A/B); confirm B's balance shows "You owe A $20." B settles up $20; confirm the balance clears to zero (row disappears).
