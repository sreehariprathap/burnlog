# MoneyLog Payment Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MoneyLog the one real payment surface for the app suite — any app can request a balance-gated payment via an in-app sheet, and ShoppingLog checkout is rewired to use it instead of silently writing ledger rows.

**Architecture:** A new `Payment` record type (Prisma) backs a balance-gated `POST /api/moneylog/pay` endpoint. A `PaymentProvider` React context (mounted once, app-wide) exposes `usePayment().requestPayment(...)`, which opens a `PaymentSheet` Drawer themed as MoneyLog regardless of the caller's active app theme. ShoppingLog's checkout calls `requestPayment` once per seller, then a slimmed-down checkout route creates the order only after payment succeeds.

**Tech Stack:** Next.js 15 App Router, Supabase (`@supabase/supabase-js` service-role client — this codebase never uses `PrismaClient` at runtime, only `prisma/schema.prisma` + `prisma db push` to manage the Postgres schema), `motion/react`, existing shadcn/vaul `Drawer` primitives, Tailwind v4 tokens from `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-01-moneylog-payment-sheet-design.md`

## Global Constraints

- No test framework exists in this repo (no vitest/jest, no `*.test.ts` files anywhere). Every task's "test" step is `npx tsc --noEmit -p .` (must stay clean) plus a concrete manual verification procedure (curl or dev-server click-through) — do not introduce a test framework as part of this plan; that's a separate decision outside this feature's scope.
- Currency is a single implicit currency throughout (no FX, no currency selector) — `formatCurrency` from `lib/format.ts` (INR) is the only formatter to use.
- The payer is always derived server-side from the authenticated session (`supabase.auth.getUser()` → `profiles.userId`) — never trust a client-supplied payer id.
- This codebase never wraps multi-step writes in a DB transaction anywhere (including the very checkout route this plan modifies) — matching that convention, `/api/moneylog/pay`'s balance-check-then-insert is sequential, not transactionally locked. This leaves a narrow theoretical race window (two simultaneous payments from the same profile at the same instant) identical in kind to every other money-writing code path in this app today. Task 3 leaves an explicit code comment about this; introducing Postgres transactions/RPCs would be new infrastructure this codebase doesn't use anywhere else, and is out of scope here.
- Follow the existing API route auth pattern exactly (see `app/api/shoppinglog/checkout/route.ts`): `createClient()` for `auth.getUser()`, `createServiceRoleClient()` for all data access, a local `getMyProfileId(admin, userId)` helper.

---

### Task 1: Prisma schema — `Payment` model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `payments` table with columns `id, payerId, payeeId, amount, sourceApp, category, memo, createdAt`; `finance_transactions.paymentId` (nullable FK); `shop_orders.paymentId` (nullable, unique FK).

- [ ] **Step 1: Add the `Payment` model**

Insert this new model into `prisma/schema.prisma`, near `FinanceTransaction` (after its closing `}` around line 296):

```prisma
/// a single cross-profile transfer initiated through the shared payment sheet —
/// the source of truth that ties together the payer's expense row and the
/// payee's income row in finance_transactions
model Payment {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payer     Profile  @relation("PaymentPayer", fields: [payerId], references: [id], onDelete: Cascade)
  payerId   String   @db.Uuid
  payee     Profile  @relation("PaymentPayee", fields: [payeeId], references: [id], onDelete: Cascade)
  payeeId   String   @db.Uuid
  amount    Float
  sourceApp String // 'moneylog' | 'shoppinglog' | ... — which app requested this payment
  category  String // e.g. 'shopping', 'transfer' — mirrors finance_transactions.category
  memo      String?
  createdAt DateTime @default(now())

  transactions FinanceTransaction[]
  shopOrder    ShopOrder?

  @@map("payments")
}
```

- [ ] **Step 2: Add `paymentId` to `FinanceTransaction`**

In the existing `model FinanceTransaction { ... }` block, add these two lines right after the `notes String?` line:

```prisma
  paymentId String?  @db.Uuid
  payment   Payment? @relation(fields: [paymentId], references: [id])
```

- [ ] **Step 3: Add `paymentId` to `ShopOrder`**

In the existing `model ShopOrder { ... }` block, add these two lines right after `totalAmount Float`:

```prisma
  paymentId String?  @unique @db.Uuid
  payment   Payment? @relation(fields: [paymentId], references: [id])
```

- [ ] **Step 4: Add the reverse relations on `Profile`**

In `model Profile { ... }`, add these two lines next to the existing `FinanceTransaction FinanceTransaction[]` line:

```prisma
  paymentsAsPayer Payment[] @relation("PaymentPayer")
  paymentsAsPayee Payment[] @relation("PaymentPayee")
```

- [ ] **Step 5: Push the schema and regenerate the client**

```bash
npx prisma db push
npx prisma generate
```

Expected: both commands exit 0. `db push` reports the new `payments` table and the two new columns being created.

- [ ] **Step 6: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors (nothing references the new model yet, so this just confirms the schema itself is syntactically valid and codegen succeeded).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(moneylog): add Payment model backing the shared payment sheet"
```

---

### Task 2: Balance helper + `GET /api/moneylog/balance`

**Files:**
- Create: `lib/moneylog/balance.ts`
- Create: `app/api/moneylog/balance/route.ts`

**Interfaces:**
- Produces: `getBalance(admin: Admin, profileId: string): Promise<number>` — used by Task 3 and this route.
- Produces: `GET /api/moneylog/balance` → `200 { balance: number }` or `401`/`404`.

- [ ] **Step 1: Write the balance helper**

Create `lib/moneylog/balance.ts`:

```ts
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
```

- [ ] **Step 2: Write the balance route**

Create `app/api/moneylog/balance/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getBalance } from '@/lib/moneylog/balance';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const balance = await getBalance(admin, meId);
    return NextResponse.json({ balance });
  } catch (error) {
    console.error('moneylog balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`), log in in a browser so you have a session cookie, then in that same browser tab open `http://localhost:3000/api/moneylog/balance` directly. Expected: a JSON body like `{"balance":0}` (or whatever your logged-in profile's real net is) — not a 401.

- [ ] **Step 5: Commit**

```bash
git add lib/moneylog/balance.ts app/api/moneylog/balance/route.ts
git commit -m "feat(moneylog): add balance helper and GET /api/moneylog/balance"
```

---

### Task 3: `POST /api/moneylog/pay`

**Files:**
- Create: `app/api/moneylog/pay/route.ts`

**Interfaces:**
- Consumes: `getBalance` from Task 2 (`@/lib/moneylog/balance`).
- Produces: `POST /api/moneylog/pay` request body `{ payeeId: string; amount: number; category: string; memo?: string; sourceApp: string }` → `200 { paymentId: string; balance: number }` | `400` | `404` | `409 { error: 'insufficient_funds'; balance: number }`. This exact response shape is what Task 5's `PaymentProvider` consumes.

- [ ] **Step 1: Write the route**

Create `app/api/moneylog/pay/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getBalance } from '@/lib/moneylog/balance';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface PayRequestBody {
  payeeId?: string;
  amount?: number;
  category?: string;
  memo?: string;
  sourceApp?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = (await request.json()) as PayRequestBody;
    const { payeeId, amount, category, memo, sourceApp } = body;

    if (!payeeId || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'payeeId and a positive amount are required' }, { status: 400 });
    }
    if (!category || !sourceApp) {
      return NextResponse.json({ error: 'category and sourceApp are required' }, { status: 400 });
    }
    if (payeeId === meId) {
      return NextResponse.json({ error: 'Cannot pay yourself' }, { status: 400 });
    }

    const { data: me } = await admin.from('profiles').select('username').eq('id', meId).single();
    const { data: payee } = await admin.from('profiles').select('id, username').eq('id', payeeId).single();
    if (!payee) {
      return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
    }

    // No DB transaction here — see the "Global Constraints" note on this
    // codebase's existing convention of sequential (non-transactional)
    // writes for money-moving operations. This check-then-insert has a
    // narrow theoretical race window under truly concurrent payments from
    // the same profile.
    const balance = await getBalance(admin, meId);
    if (amount > balance) {
      return NextResponse.json({ error: 'insufficient_funds', balance }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({ payerId: meId, payeeId, amount, sourceApp, category, memo: memo ?? null })
      .select('id')
      .single();
    if (paymentError || !payment) {
      return NextResponse.json({ error: paymentError?.message ?? 'Failed to create payment' }, { status: 400 });
    }

    await admin.from('finance_transactions').insert([
      {
        profileId: meId,
        type: 'expense',
        category,
        label: memo ? `Payment to @${payee.username}: ${memo}` : `Payment to @${payee.username}`,
        amount,
        paymentId: payment.id,
      },
      {
        profileId: payeeId,
        type: 'income',
        category,
        label: memo ? `Payment from @${me?.username ?? 'someone'}: ${memo}` : `Payment from @${me?.username ?? 'someone'}`,
        amount,
        paymentId: payment.id,
      },
    ]);

    return NextResponse.json({ paymentId: payment.id, balance: balance - amount });
  } catch (error) {
    console.error('moneylog pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Manual verification (happy path)**

With the dev server running and a logged-in session cookie in the browser, use the browser devtools console (so the request carries your session cookie) to run:

```js
fetch('/api/moneylog/pay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payeeId: '<some other real profile id from your profiles table>', amount: 1, category: 'transfer', sourceApp: 'moneylog' }),
}).then(r => r.json()).then(console.log);
```

Expected: `{ paymentId: "...", balance: <your balance minus 1> }`. Then re-fetch `/api/moneylog/balance` and confirm it dropped by 1.

- [ ] **Step 4: Manual verification (insufficient funds)**

Repeat the same fetch with `amount: 999999999`. Expected: response status `409`, body `{ error: 'insufficient_funds', balance: <unchanged> }`, and `/api/moneylog/balance` confirms nothing was deducted.

- [ ] **Step 5: Commit**

```bash
git add app/api/moneylog/pay/route.ts
git commit -m "feat(moneylog): add balance-gated POST /api/moneylog/pay"
```

---

### Task 4: Currency-transfer processing card

**Files:**
- Create: `components/ui/currency-transfer-card.tsx`

**Interfaces:**
- Produces: `<CurrencyTransferCard status={'processing'|'success'|'error'} fromLabel={string} toLabel={string} amount={number} transactionId={string | undefined} />` — consumed by Task 5's `PaymentSheet`.

- [ ] **Step 1: Write the component**

Create `components/ui/currency-transfer-card.tsx`:

```tsx
// components/ui/currency-transfer-card.tsx
// Local adaptation of the "Transfer in Progress -> Transfer Completed"
// animated status card at https://kokonutui.com/docs/cards/currency-transfer,
// re-themed onto our own design tokens and built on `motion` (already a
// dependency), matching how components/ui/multi-step-loader.tsx was adapted.
'use client';

import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export type TransferStatus = 'processing' | 'success' | 'error';

interface CurrencyTransferCardProps {
  status: TransferStatus;
  fromLabel: string;
  toLabel: string;
  amount: number;
  transactionId?: string;
}

const TITLES: Record<TransferStatus, string> = {
  processing: 'Transfer in Progress',
  success: 'Transfer Completed',
  error: 'Transfer Failed',
};

export function CurrencyTransferCard({
  status,
  fromLabel,
  toLabel,
  amount,
  transactionId,
}: CurrencyTransferCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
        <motion.div
          key={status}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, rotate: status === 'processing' ? 360 : 0 }}
          transition={
            status === 'processing'
              ? { rotate: { duration: 1.2, repeat: Infinity, ease: 'linear' } }
              : { type: 'spring', stiffness: 300, damping: 20 }
          }
          className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border"
        >
          {status === 'processing' && <ArrowRightLeft className="h-5 w-5 text-primary" />}
          {status === 'success' && <CheckCircle2 className="h-6 w-6 text-primary" />}
          {status === 'error' && <XCircle className="h-6 w-6 text-destructive" />}
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={TITLES[status]}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-sm font-medium text-foreground"
        >
          {TITLES[status]}
        </motion.p>
      </AnimatePresence>

      <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="font-medium truncate max-w-[9rem]">{fromLabel}</span>
        </div>
        <span className={cn('font-semibold tabular-nums', status === 'error' && 'text-muted-foreground line-through')}>
          {formatCurrency(amount)}
        </span>
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">To</span>
          <span className="font-medium truncate max-w-[9rem]">{toLabel}</span>
        </div>
      </div>

      {transactionId && (
        <p className="text-xs text-muted-foreground">Ref: TXN-{transactionId.slice(0, 8).toUpperCase()}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint components/ui/currency-transfer-card.tsx
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add components/ui/currency-transfer-card.tsx
git commit -m "feat(moneylog): add currency-transfer status card"
```

---

### Task 5: `PaymentSheet` + `PaymentProvider`

**Files:**
- Create: `components/PaymentSheet.tsx`
- Create: `lib/moneylog/paymentContext.tsx`
- Modify: `app/RootLayoutClient.tsx`

**Interfaces:**
- Consumes: `CurrencyTransferCard` (Task 4), `getBalance`-shaped response from `GET /api/moneylog/balance` (Task 2), `POST /api/moneylog/pay` response shape (Task 3).
- Produces: `usePayment(): { requestPayment: (input: PaymentRequest) => Promise<PaymentResult> }`, exported from `lib/moneylog/paymentContext.tsx`. This is what Task 7 (ShoppingLog cart) calls.

```ts
export interface PaymentRequest {
  payeeId: string;
  payeeLabel: string; // display name, e.g. "@seller_username"
  amount: number;
  category: string;
  memo?: string;
  sourceApp: string;
}

export type PaymentResult =
  | { success: true; paymentId: string }
  | { success: false; reason: 'insufficient_funds' | 'declined' | 'error' };
```

- [ ] **Step 1: Write the presentational sheet**

Create `components/PaymentSheet.tsx`:

```tsx
// components/PaymentSheet.tsx
'use client';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { CurrencyTransferCard } from '@/components/ui/currency-transfer-card';
import { formatCurrency } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export type PaymentSheetPhase = 'review' | 'processing' | 'success' | 'insufficient' | 'error';

interface PaymentSheetProps {
  open: boolean;
  phase: PaymentSheetPhase;
  payeeLabel: string;
  amount: number;
  memo?: string;
  balance: number | null;
  transactionId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentSheet({
  open,
  phase,
  payeeLabel,
  amount,
  memo,
  balance,
  transactionId,
  onConfirm,
  onCancel,
}: PaymentSheetProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next && phase === 'review') onCancel(); }} dismissible={phase === 'review'}>
      <DrawerContent className="app-moneylog">
        <DrawerHeader>
          <DrawerTitle>{phase === 'review' ? 'Confirm Payment' : 'MoneyLog'}</DrawerTitle>
        </DrawerHeader>

        {phase === 'review' && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paying</span>
              <span className="font-medium">{payeeLabel}</span>
            </div>
            {memo && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">For</span>
                <span className="font-medium truncate max-w-[60%] text-right">{memo}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Amount</span>
              <span>{formatCurrency(amount)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Your balance</span>
              <span>{balance === null ? 'Loading…' : formatCurrency(balance)}</span>
            </div>
          </div>
        )}

        {(phase === 'processing' || phase === 'success' || phase === 'error') && (
          <div className="px-4 pb-4">
            <CurrencyTransferCard
              status={phase === 'processing' ? 'processing' : phase === 'success' ? 'success' : 'error'}
              fromLabel="You"
              toLabel={payeeLabel}
              amount={amount}
              transactionId={transactionId ?? undefined}
            />
          </div>
        )}

        {phase === 'insufficient' && (
          <div className="px-4 pb-4 flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Not enough balance</p>
            <p className="text-xs text-muted-foreground">
              This payment is {formatCurrency(amount)}, but your balance is {balance === null ? '—' : formatCurrency(balance)}.
            </p>
          </div>
        )}

        <DrawerFooter>
          {phase === 'review' && (
            <>
              <Button onClick={onConfirm} disabled={balance === null}>Pay {formatCurrency(amount)}</Button>
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            </>
          )}
          {(phase === 'insufficient' || phase === 'error') && (
            <Button variant="ghost" onClick={onCancel}>Close</Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Write the provider**

Create `lib/moneylog/paymentContext.tsx`:

```tsx
// lib/moneylog/paymentContext.tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { PaymentSheet, type PaymentSheetPhase } from '@/components/PaymentSheet';

export interface PaymentRequest {
  payeeId: string;
  payeeLabel: string;
  amount: number;
  category: string;
  memo?: string;
  sourceApp: string;
}

export type PaymentResult =
  | { success: true; paymentId: string }
  | { success: false; reason: 'insufficient_funds' | 'declined' | 'error' };

interface PaymentContextValue {
  requestPayment: (input: PaymentRequest) => Promise<PaymentResult>;
}

const PaymentContext = createContext<PaymentContextValue>({
  requestPayment: async () => ({ success: false, reason: 'error' }),
});

export function PaymentProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PaymentRequest | null>(null);
  const [phase, setPhase] = useState<PaymentSheetPhase>('review');
  const [balance, setBalance] = useState<number | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const resolveRef = useRef<((result: PaymentResult) => void) | null>(null);

  const closeAndResolve = useCallback((result: PaymentResult) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
    setTransactionId(null);
  }, []);

  const requestPayment = useCallback((input: PaymentRequest): Promise<PaymentResult> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending(input);
      setPhase('review');
      setBalance(null);
      setTransactionId(null);

      fetch('/api/moneylog/balance')
        .then((r) => r.json())
        .then((data) => setBalance(typeof data.balance === 'number' ? data.balance : 0))
        .catch(() => setBalance(0));
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pending) return;
    setPhase('processing');
    try {
      const res = await fetch('/api/moneylog/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      const data = await res.json();

      if (res.status === 409 && data.error === 'insufficient_funds') {
        setBalance(data.balance);
        setPhase('insufficient');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        return;
      }

      setTransactionId(data.paymentId);
      setPhase('success');
      setTimeout(() => closeAndResolve({ success: true, paymentId: data.paymentId }), 1200);
    } catch {
      setPhase('error');
    }
  }, [pending, closeAndResolve]);

  const handleCancel = useCallback(() => {
    if (phase === 'insufficient') {
      closeAndResolve({ success: false, reason: 'insufficient_funds' });
    } else if (phase === 'error') {
      closeAndResolve({ success: false, reason: 'error' });
    } else {
      closeAndResolve({ success: false, reason: 'declined' });
    }
  }, [phase, closeAndResolve]);

  return (
    <PaymentContext.Provider value={{ requestPayment }}>
      {children}
      <PaymentSheet
        open={!!pending}
        phase={phase}
        payeeLabel={pending?.payeeLabel ?? ''}
        amount={pending?.amount ?? 0}
        memo={pending?.memo}
        balance={balance}
        transactionId={transactionId}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  return useContext(PaymentContext);
}
```

- [ ] **Step 3: Mount the provider in `RootLayoutClient`**

In `app/RootLayoutClient.tsx`, add the import next to the `AppSwitchProvider` import:

```ts
import { PaymentProvider } from "@/lib/moneylog/paymentContext";
```

Then wrap `children` (and everything currently inside `AppSwitchProvider`) with `PaymentProvider`, nested inside `AppSwitchProvider`:

```tsx
<AppSwitchProvider>
  <PaymentProvider>
    <SplashScreen />
    <OfflineBanner />
    <ErrorBoundary>{children}</ErrorBoundary>
    <SwitchLoader />
    <Toaster />
    <PWAInstall />
    <PWAStatus />
    <PWAUpdateNotification />
  </PaymentProvider>
</AppSwitchProvider>
```

- [ ] **Step 4: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint components/PaymentSheet.tsx lib/moneylog/paymentContext.tsx app/RootLayoutClient.tsx
```

Expected: both clean.

- [ ] **Step 5: Manual verification**

`usePayment` isn't wired to any real UI until Task 7, and React hooks can't be called from the browser devtools console. To verify the sheet works end-to-end now, temporarily add a test trigger inside an existing page — e.g. in `app/(moneylog)/moneylog/page.tsx`, add this import:

```tsx
import { usePayment } from '@/lib/moneylog/paymentContext';
```

then inside the `MoneyLogPage` component function body add:

```tsx
const { requestPayment } = usePayment();
```

and drop a temporary button into its returned JSX:

```tsx
<button onClick={() => requestPayment({ payeeId: '<a real other profile id>', payeeLabel: 'Test Payee', amount: 1, category: 'transfer', sourceApp: 'moneylog' }).then(console.log)}>
  Test Payment
</button>
```

Run the dev server, click it, confirm: the sheet opens themed in MoneyLog's teal, shows the balance, clicking Pay shows the processing → success animation, and the sheet auto-closes. Check the browser console for the logged result `{ success: true, paymentId: "..." }`. Revert this temporary import/button afterward — do not commit it.

- [ ] **Step 6: Commit**

```bash
git add components/PaymentSheet.tsx lib/moneylog/paymentContext.tsx app/RootLayoutClient.tsx
git commit -m "feat(moneylog): add PaymentSheet and PaymentProvider (usePayment hook)"
```

---

### Task 6: Rewire ShoppingLog checkout route to require an existing payment

**Files:**
- Modify: `app/api/shoppinglog/checkout/route.ts`

**Interfaces:**
- Consumes: a `payments` row (Task 1/3) — `{ id, payerId, payeeId, amount }`.
- Produces: `POST /api/shoppinglog/checkout` new request body `{ sellerId: string; paymentId: string }` → `200 { order: { id, sellerId, totalAmount } }` | `400` | `403` | `404` | `409`. This is what Task 7's cart page calls, once per seller.

- [ ] **Step 1: Replace the route body**

Replace the entire contents of `app/api/shoppinglog/checkout/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface CheckoutBody {
  sellerId?: string;
  paymentId?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { sellerId, paymentId } = (await request.json()) as CheckoutBody;
    if (!sellerId || !paymentId) {
      return NextResponse.json({ error: 'sellerId and paymentId are required' }, { status: 400 });
    }

    // The payment must exist, belong to this buyer, and be made out to this
    // exact seller — a caller can't reuse someone else's payment or point a
    // payment at a different seller than the one it was made to.
    const { data: payment } = await admin
      .from('payments')
      .select('id, payerId, payeeId, amount')
      .eq('id', paymentId)
      .single();
    if (!payment || payment.payerId !== meId || payment.payeeId !== sellerId) {
      return NextResponse.json({ error: 'Payment does not match this checkout' }, { status: 403 });
    }

    // Idempotency: a payment can only ever back one order.
    const { data: existingOrder } = await admin
      .from('shop_orders')
      .select('id')
      .eq('paymentId', paymentId)
      .maybeSingle();
    if (existingOrder) {
      return NextResponse.json({ error: 'This payment has already been used for an order' }, { status: 409 });
    }

    const { data: cartRows } = await admin
      .from('shop_cart_items')
      .select('id, quantity, listing:shop_listings(id, title, price, "stockQuantity", status, sellerId)')
      .eq('profileId', meId);

    type CartRow = {
      id: string;
      quantity: number;
      listing: { id: string; title: string; price: number; stockQuantity: number; status: string; sellerId: string } | null;
    };

    const sellerItems = ((cartRows ?? []) as unknown as CartRow[]).filter(
      (r) =>
        r.listing !== null &&
        r.listing.sellerId === sellerId &&
        r.listing.status === 'active' &&
        r.listing.stockQuantity >= r.quantity
    );

    if (sellerItems.length === 0) {
      return NextResponse.json({ error: 'No purchasable items from this seller in your cart' }, { status: 400 });
    }

    const totalAmount = sellerItems.reduce((sum, i) => sum + i.listing!.price * i.quantity, 0);
    if (Math.abs(totalAmount - payment.amount) > 0.01) {
      return NextResponse.json({ error: 'Cart changed since payment — amounts no longer match' }, { status: 409 });
    }

    const { data: order, error: orderError } = await admin
      .from('shop_orders')
      .insert({ buyerId: meId, sellerId, totalAmount, paymentId })
      .select('id')
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? 'Failed to create order' }, { status: 400 });
    }

    await admin.from('shop_order_items').insert(
      sellerItems.map((i) => ({
        orderId: order.id,
        listingId: i.listing!.id,
        title: i.listing!.title,
        price: i.listing!.price,
        quantity: i.quantity,
      }))
    );

    for (const i of sellerItems) {
      const remaining = i.listing!.stockQuantity - i.quantity;
      await admin
        .from('shop_listings')
        .update({ stockQuantity: remaining, status: remaining <= 0 ? 'sold' : 'active' })
        .eq('id', i.listing!.id);
    }

    await admin
      .from('shop_cart_items')
      .delete()
      .in('id', sellerItems.map((i) => i.id));

    return NextResponse.json({ order: { id: order.id, sellerId, totalAmount } });
  } catch (error) {
    console.error('shoppinglog checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors (Task 7 hasn't updated the caller yet, so the old client code calling this route with no body will now get a `400` at runtime until Task 7 lands — that's expected and fixed next).

- [ ] **Step 3: Commit**

```bash
git add app/api/shoppinglog/checkout/route.ts
git commit -m "refactor(shoppinglog): checkout now requires a prior MoneyLog payment"
```

---

### Task 7: Rewire ShoppingLog cart checkout to pay-then-order

**Files:**
- Modify: `app/(shoppinglog)/shoppinglog/cart/page.tsx`

**Interfaces:**
- Consumes: `usePayment` (Task 5, `@/lib/moneylog/paymentContext`), the new `POST /api/shoppinglog/checkout` contract (Task 6).

- [ ] **Step 1: Update imports and grouping**

In `app/(shoppinglog)/shoppinglog/cart/page.tsx`, add this import near the other local imports:

```ts
import { usePayment } from '@/lib/moneylog/paymentContext';
```

Replace the `grouped` computation:

```ts
  const grouped = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    const key = item.listing.seller?.username ?? 'unknown';
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
```

with:

```ts
  type SellerGroup = { sellerId: string; username: string; items: CartItem[] };

  const grouped = items.reduce<Record<string, SellerGroup>>((acc, item) => {
    const sellerId = item.listing.seller?.id ?? 'unknown';
    const username = item.listing.seller?.username ?? 'unknown';
    (acc[sellerId] ??= { sellerId, username, items: [] }).items.push(item);
    return acc;
  }, {});
```

- [ ] **Step 2: Update the JSX that renders `grouped`**

The render currently does `Object.entries(grouped).map(([sellerUsername, sellerItems]) => ...)` with `sellerItems.map(...)`. Update it to match the new shape:

```tsx
        {Object.values(grouped).map((group) => (
          <div key={group.sellerId} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sold by @{group.username}</p>
            {group.items.map((item) => (
```

(everything inside that inner `.map` stays exactly as it was — only the two lines above change: the outer iterable and the variable it destructures from).

- [ ] **Step 3: Replace `checkout`**

Replace the existing `checkout` function:

```ts
  const checkout = async () => {
    setCheckingOut(true);
    const res = await apiFetch('/api/shoppinglog/checkout', { method: 'POST' });
    if (res.ok) {
      await mutate();
      toast({ title: 'Order placed' });
      router.push('/shoppinglog/orders');
    }
    setCheckingOut(false);
  };
```

with:

```ts
  const { requestPayment } = usePayment();

  const checkout = async () => {
    setCheckingOut(true);
    let succeededCount = 0;
    let stoppedEarly = false;

    for (const group of Object.values(grouped)) {
      if (group.sellerId === 'unknown') {
        stoppedEarly = true;
        break;
      }

      const subtotal = group.items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
      const memo = group.items.map((i) => i.listing.title).join(', ');

      const payment = await requestPayment({
        payeeId: group.sellerId,
        payeeLabel: `@${group.username}`,
        amount: subtotal,
        category: 'shopping',
        memo,
        sourceApp: 'shoppinglog',
      });

      if (!payment.success) {
        stoppedEarly = true;
        break;
      }

      const res = await apiFetch('/api/shoppinglog/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: group.sellerId, paymentId: payment.paymentId }),
      });

      if (!res.ok) {
        // Payment succeeded but order creation failed (e.g. cart changed
        // concurrently) — rare, and not auto-reconciled here.
        stoppedEarly = true;
        break;
      }

      succeededCount += 1;
    }

    await mutate();

    if (succeededCount > 0) {
      toast({
        title: stoppedEarly ? `${succeededCount} order(s) placed` : 'Order placed',
        description: stoppedEarly ? 'One seller could not be paid — remaining items stay in your cart.' : undefined,
      });
      router.push('/shoppinglog/orders');
    } else if (stoppedEarly) {
      toast({ variant: 'destructive', title: 'Checkout stopped', description: 'No payment went through.' });
    }

    setCheckingOut(false);
  };
```

- [ ] **Step 4: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint "app/(shoppinglog)/shoppinglog/cart/page.tsx"
```

Expected: both clean.

- [ ] **Step 5: Manual end-to-end verification**

In the dev server, logged in as a buyer profile with a positive MoneyLog balance:
1. Add a listing from a single seller to the cart, go to `/shoppinglog/cart`, click Checkout.
2. Confirm the MoneyLog payment sheet opens (teal theme) showing the correct seller and amount, click Pay, watch it animate to success, and confirm you land on `/shoppinglog/orders` with the new order visible.
3. Check `/api/moneylog/balance` dropped by the order total, and (as the seller's account, or via a DB check) that the seller's balance rose by the same amount.
4. Repeat with a cart containing items from two different sellers — confirm two separate payment-sheet prompts appear in sequence.
5. Repeat with a buyer profile whose balance is lower than the cart total — confirm the sheet shows "Not enough balance" and no order is created.

- [ ] **Step 6: Commit**

```bash
git add "app/(shoppinglog)/shoppinglog/cart/page.tsx"
git commit -m "feat(shoppinglog): checkout now pays through MoneyLog before creating orders"
```
