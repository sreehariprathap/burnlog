# MoneyLog Asset / Net Worth Tracking — Design

## Problem

MoneyLog tracks income and expense transactions, but has no concept of what the user actually
owns — bank balances, investments, cash on hand, debts. This feature lets a user declare their
real-world assets and periodically update their values, giving a net-worth figure and trend
over time.

## Scope

In scope:
- A user-managed list of assets, each with a name and category (bank, investment, cash, debt,
  other).
- A dated history of balance updates per asset (not an overwrite-in-place field) — mirrors the
  existing `WeightEntry` pattern in this codebase.
- A net worth figure: sum of bank/investment/cash/other latest values, minus sum of debt latest
  values.
- A dedicated `/moneylog/assets` page (list + net worth summary) and an `/moneylog/assets/[id]`
  detail page (history + trend chart), plus a summary card on the MoneyLog home page.
- Soft-delete (archive) for assets, so balance history is never orphaned.

Out of scope (explicitly deferred):
- Any interaction with the payment wallet / `finance_transactions` ledger from the previous
  feature — this is a fully separate, manually-declared net-worth tracker. No shared math, no
  reconciliation, no automatic updates from payments.
- Bank/brokerage API integrations (Plaid-style auto-sync) — "sync" here means the user manually
  updates a number, not a live data feed. A real integration is a distinct, much larger future
  project.
- Multi-currency assets (single implicit currency, matching the rest of MoneyLog).
- Editing or deleting individual historical balance entries — only adding new ones and
  archiving the whole asset.

## Data model

```prisma
/// a user-declared real-world holding (bank account, investment account, cash, debt) —
/// tracked as a dated history of balance snapshots, not a single overwritten field
model Asset {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile    Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId  String   @db.Uuid
  name       String   // e.g. "HDFC Savings", "Zerodha Portfolio"
  category   String   // 'bank' | 'investment' | 'cash' | 'debt' | 'other'
  createdAt  DateTime @default(now())
  archivedAt DateTime? // soft-delete — history under an archived asset is preserved, just hidden

  balanceEntries AssetBalanceEntry[]

  @@map("assets")
}

/// one dated balance snapshot for an asset — the asset's "current value" is its latest entry
model AssetBalanceEntry {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  assetId   String   @db.Uuid
  value     Float    // always stored positive, even for 'debt' — the asset's category determines its sign in net worth math
  date      DateTime @default(now())
  notes     String?
  createdAt DateTime @default(now())

  @@map("asset_balance_entries")
}
```

`Profile` gains a reverse relation `assets Asset[]`.

**Net worth formula** (computed on demand, not stored):
```
netWorth(profileId) =
  sum(latest value of each non-archived asset where category != 'debt')
  - sum(latest value of each non-archived asset where category == 'debt')
```
"Latest value" = the `AssetBalanceEntry` with the greatest `date` for that asset (fall back to
`createdAt` on a tie). An asset with zero balance entries contributes 0 and is flagged in the UI
as "not yet updated" rather than silently omitted.

## API

All routes follow the existing auth pattern exactly (`createClient()` for `auth.getUser()`,
`createServiceRoleClient()` for data access, a local `getMyProfileId` helper) — see
`app/api/moneylog/pay/route.ts` for the reference shape.

- `GET /api/moneylog/assets` → list of the caller's non-archived assets, each with its latest
  value and `updatedAt` (the latest entry's `date`), plus the computed net worth total.
- `POST /api/moneylog/assets` → body `{ name, category, initialValue }`; creates the `Asset`
  and its first `AssetBalanceEntry` together.
- `PATCH /api/moneylog/assets/[id]` → body `{ name?, category? }`; renames/recategorizes —
  never touches value.
- `DELETE /api/moneylog/assets/[id]` → sets `archivedAt`; does not delete rows.
- `GET /api/moneylog/assets/[id]/entries` → full dated history for one asset, oldest first (for
  the trend chart).
- `POST /api/moneylog/assets/[id]/entries` → body `{ value, notes? }`; appends a new snapshot
  — this is "updating the balance."

Every route scopes to the caller's own `profileId` derived from the session; a request for an
asset id that doesn't belong to the caller returns `404`, not `403` (don't reveal existence of
another user's asset).

## UI

- **`/moneylog/assets`** — net worth summary card at top (mirrors `NetSummaryCard`'s visual
  language: big total, income/expense-style breakdown but for assets/debts instead). Below it,
  assets grouped by category, each row showing name, latest value, and a small up/down
  indicator versus the previous entry. Each row has an "Update" action (opens a drawer: enter
  new value + optional note, submits `POST .../entries`). An "Add Asset" button opens a form
  (name, category, initial value) calling `POST /api/moneylog/assets`.
- **`/moneylog/assets/[id]`** — one asset's full history as a list plus a line chart (recharts,
  already used on the Insights page) of value over time. An "Archive" action here maps to the
  `DELETE` route.
- **MoneyLog home page** — a new `NetWorthCard` component showing the total net worth figure,
  linking to `/moneylog/assets`. Placed near the existing `NetSummaryCard`.

## Error handling

- Creating an asset with a name that's empty/whitespace-only, or a category outside the fixed
  set, is rejected `400`.
- A balance entry `value` must be `>= 0` (debts are stored as a positive "amount owed", not a
  negative number) — negative input is rejected `400`.
- Archiving an already-archived asset is a no-op success (idempotent), not an error.

## Testing

- No test framework exists in this repo (established during the payment-sheet feature) —
  verification is `npx tsc --noEmit -p .` plus manual dev-server click-through, same convention.
- Manual: create one asset per category, add several balance entries with different values over
  time, confirm the net worth total updates correctly (debt subtracts, others add), confirm the
  trend chart renders, confirm archiving hides an asset from the list without deleting its
  history (verify via a direct query if needed).
