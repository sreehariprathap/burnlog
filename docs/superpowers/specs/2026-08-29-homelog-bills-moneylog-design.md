# HomeLog Bills → MoneyLog Ledger — Design

**Date:** 2026-08-29
**Status:** Approved design, implementing directly per explicit user direction
**Parent effort:** First of six planned "connect the apps" integrations (see `2026-08-25-cross-app-snapshot-design.md` for the existing read-only pattern; ShoppingLog's checkout → `FinanceTransaction` write is the direct precedent for this one).

## Goal

When a HomeLog household bill is logged or settled, reflect the real cash movement in MoneyLog automatically — no manual re-entry. The payer's upfront payment shows as a MoneyLog expense immediately; a later settle-up shows as income for the person who was owed and an expense (debt payment) for the person paying it off.

## Non-Goals

- Logging each household member's *owed* share as their own transaction before they've actually paid anything (rejected during brainstorming — money hasn't moved yet, would be misleading).
- Real payment processing — settlements remain ledger-only balance adjustments, same as today.
- Any new UI. MoneyLog already renders any category value it doesn't have a hardcoded color for using its dynamic category list, so no MoneyLog screens change.
- Editing/deleting a `HouseholdExpense` does not currently exist as a feature, so no reconciling logic for edits/deletes is needed.

## Decisions

1. **Trigger points**: two, matching the two places money actually changes hands today — `POST /api/homelog/expenses` (payer pays upfront) and `POST /api/homelog/settlements` (a debt gets paid down).
2. **Category mapping**: `HouseholdExpense.category` maps directly onto MoneyLog's existing `EXPENSE_CATEGORIES` — `rent`→`rent`, `utilities`→`utilities`, `groceries`→`groceries`, `other`→`other_expense`.
3. **New income category**: `household_settlement` (label "Household Settlement") added to `INCOME_CATEGORIES` in `lib/financeCategories.ts`, for the recipient side of a settle-up — mirrors how ShoppingLog added `shopping_sales` for the same reason (no existing category fit).
4. **Settle-up debt-side category**: reuses the existing `debt_payment` expense category — no new category needed for the person paying off a debt.
5. **Failure mode**: fire-and-forget, matching ShoppingLog checkout's existing posture — if the `finance_transactions` insert fails, the underlying `HouseholdExpense`/`HouseholdSettlement` write still succeeds and the API still returns success. Log the error server-side only.
6. **Labels**: use `firstName` (not `username`) for the counterparty name in labels, matching how the rest of HomeLog's bills UI already identifies people (`app/api/homelog/expenses/route.ts`'s `paidByName`).

## Architecture

### `app/api/homelog/expenses/route.ts` (`POST`)

After the `household_expense_splits` insert succeeds (i.e. the expense is fully persisted), insert one row into `finance_transactions`:

```ts
const CATEGORY_MAP: Record<string, string> = {
  rent: 'rent',
  utilities: 'utilities',
  groceries: 'groceries',
  other: 'other_expense',
};

await admin.from('finance_transactions').insert({
  profileId: meId,
  type: 'expense',
  category: CATEGORY_MAP[body.category] ?? 'other_expense',
  label: `HomeLog: ${body.label.trim()}`,
  amount: body.totalAmount,
});
```

Placed after the splits insert, not before — if splits fail the expense row is deleted (existing rollback logic) and no ledger entry should exist either.

### `app/api/homelog/settlements/route.ts` (`POST`)

After the `household_settlements` insert succeeds, look up both profiles' `firstName` (single `.in('id', [meId, toProfileId])` query) and insert two rows:

```ts
await admin.from('finance_transactions').insert({
  profileId: meId,
  type: 'expense',
  category: 'debt_payment',
  label: `HomeLog settle-up to ${toName}`,
  amount,
});

await admin.from('finance_transactions').insert({
  profileId: toProfileId,
  type: 'income',
  category: 'household_settlement',
  label: `HomeLog settle-up from ${meName}`,
  amount,
});
```

### `lib/financeCategories.ts`

Add one entry to `INCOME_CATEGORIES`:

```ts
{ value: 'household_settlement', label: 'Household Settlement' },
```

## Error Handling

Both insert points wrap the `finance_transactions` insert(s) in fire-and-forget fashion (no `await`ed error check that affects the response) — consistent with `app/api/shoppinglog/checkout/route.ts`'s existing behavior. A ledger-write failure never blocks or rolls back the HomeLog-side write.

## Testing

Manual, following the existing shoppinglog checkout precedent (no automated tests exist for that flow either):

1. Two profiles in the same household. Profile A logs a $90 "Groceries" expense split evenly. Confirm A's MoneyLog shows a `-$90 groceries` expense, B's MoneyLog is untouched.
2. B settles up $45 to A. Confirm A's MoneyLog shows a `+$45 Household Settlement` income entry, B's MoneyLog shows a `-$45 Debt Payment` expense entry.
3. Confirm `category:'other'` expenses map to MoneyLog's `other_expense` and render with a proper label (not a raw slug) via `categoryLabel()`.
