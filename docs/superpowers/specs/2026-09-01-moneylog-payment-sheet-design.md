# MoneyLog Payment Sheet — Design

## Problem

Cross-app "payment" already happens silently today: `app/api/shoppinglog/checkout/route.ts`
writes a `finance_transactions` expense row for the buyer and an income row for the seller
directly, with no UI, no confirmation, and no balance check. The goal is to make MoneyLog the
one real payment surface for the whole app suite — any app can request a payment, the user
sees and confirms it, MoneyLog moves the "money," and control returns to the caller. This is
the seed of an eventual Apple-Pay-style model: a wallet (MoneyLog) that any app — eventually
any third party — can request a payment from.

ShoppingLog is the first real consumer, replacing its current silent transaction-writing.

## Scope

In scope:
- A computed wallet balance for each profile (derived from existing `finance_transactions`, no new balance column).
- A `Payment` record type joining a payer, a payee, and the two ledger entries it produces.
- A server-side transfer endpoint that is balance-gated (rejects if it would go negative).
- A shared, app-agnostic client mechanism (`PaymentProvider` + `usePayment()`) any route can call to request a payment via an in-app sheet — no navigation away from the calling app.
- A `PaymentSheet` UI: Review → Processing (kokonutui-style animated transfer card) → Success, or → Insufficient Funds.
- ShoppingLog checkout rewired to pay-then-create-order through this mechanism.

Out of scope (explicitly deferred):
- A standalone "send money to a friend" picker screen inside MoneyLog itself.
- Real external/third-party app integration (OAuth, signed request tokens, redirect-based flow) — the in-app-modal approach chosen here only works because every app lives in this one Next.js deployment today. Revisit the mechanism (not just extend it) if a true external integration is ever needed.
- Refunds, partial payments, or payment cancellation after the fact.
- Multi-currency (everything is a single implicit currency, matching today's `FinanceTransaction.amount`).

## Data model

New model, plus one FK on the existing ledger table:

```prisma
/// a single cross-profile transfer initiated through the shared payment sheet —
/// the source of truth that ties together the payer's expense row and the
/// payee's income row in finance_transactions
model Payment {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payer      Profile  @relation("PaymentPayer", fields: [payerId], references: [id], onDelete: Cascade)
  payerId    String   @db.Uuid
  payee      Profile  @relation("PaymentPayee", fields: [payeeId], references: [id], onDelete: Cascade)
  payeeId    String   @db.Uuid
  amount     Float
  sourceApp  String   // 'moneylog' | 'shoppinglog' | ... — which app requested this payment
  category   String   // e.g. 'shopping', 'transfer' — mirrors finance_transactions.category
  memo       String?
  createdAt  DateTime @default(now())

  transactions FinanceTransaction[]

  @@map("payments")
}
```

`FinanceTransaction` gains a nullable `paymentId String? @db.Uuid` + relation to `Payment`.
Existing rows (all the ShoppingLog-generated ones from before this feature, plus every manual
log entry) keep `paymentId = null` — manual logging is untouched and doesn't go through this
path.

**Balance** is not stored. It's computed on demand as:
```
balance(profileId) = sum(amount where type='income') - sum(amount where type='expense')
```
over that profile's `finance_transactions`. This matches how `NetSummaryCard` already
computes net today (to confirm during implementation) and avoids any balance-column
sync/consistency problem.

## Backend: `POST /api/moneylog/pay`

Request: `{ payeeId: string, amount: number, category: string, memo?: string, sourceApp: string }`
(server derives `payerId` from the authenticated session — never trust a client-supplied payer).

Behavior, in a single transaction:
1. Load payer's current balance.
2. If `amount <= 0`, `400`.
3. If `amount > balance`, `409 { error: 'insufficient_funds', balance }` — nothing is written.
4. Otherwise: insert one `Payment` row, then two `FinanceTransaction` rows (payer: `type='expense'`, payee: `type='income'`), both carrying `paymentId`.
5. Return `{ paymentId, balance: <payer's new balance> }`.

This is the only place balance-gated transfers happen. It has no knowledge of ShoppingLog,
carts, or orders — `sourceApp`/`category`/`memo` are opaque strings the caller supplies for
labeling.

## Client mechanism

`lib/moneylog/paymentContext.tsx` — `PaymentProvider`, mounted once in `RootLayoutClient`
alongside the existing `AppSwitchProvider`. Exposes:

```ts
requestPayment(input: {
  payeeId: string;
  payeeLabel: string;   // display name, e.g. "@seller_username"
  amount: number;
  category: string;
  memo?: string;
  sourceApp: string;
}): Promise<{ success: true; paymentId: string } | { success: false; reason: 'insufficient_funds' | 'declined' | 'error' }>
```

Calling it opens `PaymentSheet` (a Drawer, reusing the `components/ui/drawer` primitives
already used by `AppSwitcher`) as an overlay on top of whatever page is currently mounted —
no route change. The sheet is always rendered with the `.app-moneylog` theme class applied
directly to its own root (regardless of which app's theme is active underneath), since it's
MoneyLog's surface.

**Sheet states:**
- **Review** — payee, amount, memo, current balance, Pay / Cancel buttons.
- **Processing** — kokonutui-style animated card (adapted like `MultiStepLoader` was: our
  tokens, `motion` package, no new deps): rotating icon while the `POST /api/moneylog/pay`
  call is in flight, morphing to a checkmark on success, showing the `paymentId` as a
  "TXN-xxxx" reference.
- **Insufficient Funds** — shown instead of Processing if the balance check fails; states the
  shortfall, Cancel only (no retry-with-different-amount inline — caller decides what to do
  with a `success: false` result).

Cancel at the Review step resolves the promise with `{ success: false, reason: 'declined' }`
and never calls the API.

## ShoppingLog integration

`app/(shoppinglog)/shoppinglog/cart/page.tsx`'s `checkout()` changes from one
`POST /api/shoppinglog/checkout` call to, per distinct seller in the cart:
1. `requestPayment({ payeeId: sellerId, payeeLabel: '@' + sellerUsername, amount: sellerSubtotal, category: 'shopping', memo: <item summary>, sourceApp: 'shoppinglog' })`
2. Only if that resolves `success: true`, call a (slimmed-down) per-seller order-creation
   endpoint that creates the `ShopOrder`/`ShopOrderItem` rows and decrements stock — it no
   longer writes `finance_transactions` itself, since `/api/moneylog/pay` already did.
3. If a payment is declined/insufficient partway through a multi-seller cart, stop — sellers
   already paid keep their orders created (their payment already succeeded), the remaining
   unpaid items stay in the cart. The UI reports which sellers succeeded/failed.

`app/api/shoppinglog/checkout/route.ts` is split: order-creation logic stays (now assuming
payment already happened), the inline `finance_transactions` inserts are removed.

## Error handling

- Network/server error during `/api/moneylog/pay` → sheet shows a generic failure state,
  `requestPayment` resolves `{ success: false, reason: 'error' }`.
- Concurrent payments racing the same balance (two payments in flight for one payer) → the
  balance check + inserts run inside one DB transaction with a `SELECT ... FOR UPDATE`-style
  read (implementation detail decided in the plan) so a double-spend past zero can't happen.

## Testing

- Unit: balance computation (income − expense), the pay endpoint's insufficient-funds
  rejection, the happy-path insert of `Payment` + both `FinanceTransaction` rows.
- Manual: trigger a ShoppingLog checkout end-to-end in the dev server — single seller,
  multi-seller cart, and an insufficient-funds case (a profile with a very low/negative
  balance) — confirm the sheet renders in MoneyLog's theme regardless of the calling app's
  active theme.
