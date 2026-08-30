# HomeLog Bills → MoneyLog Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a HomeLog bill is logged or settled, automatically write the corresponding MoneyLog `finance_transactions` row(s), so users never have to re-enter the same spend by hand.

**Architecture:** Two existing API routes (`app/api/homelog/expenses/route.ts`, `app/api/homelog/settlements/route.ts`) each get one fire-and-forget `finance_transactions` insert appended after their existing write succeeds. One new category value is added to `lib/financeCategories.ts`. No new files, no schema changes.

**Tech Stack:** Next.js route handlers, Supabase service-role client (`@supabase/supabase-js`), Prisma-defined Postgres tables accessed via the Supabase query builder (not Prisma client directly — this codebase queries `finance_transactions`/`household_expenses` etc. through `admin.from(...)`, matching the existing routes).

## Global Constraints

- Category mapping: `HouseholdExpense.category` → MoneyLog expense category: `rent`→`rent`, `utilities`→`utilities`, `groceries`→`groceries`, `other`→`other_expense`. (Design spec, Decision 2.)
- New income category `household_settlement` / label `"Household Settlement"` added to `INCOME_CATEGORIES`. (Design spec, Decision 3.)
- Settle-up debt side reuses existing `debt_payment` expense category — no new category. (Design spec, Decision 4.)
- All ledger inserts are fire-and-forget: a failure must never block or roll back the HomeLog-side write, and must never surface as an API error to the client. Log server-side only. (Design spec, Decision 5.)
- Counterparty names in labels come from `profiles.firstName`, not `username`. (Design spec, Decision 6.)
- Full design spec: `docs/superpowers/specs/2026-08-29-homelog-bills-moneylog-design.md`

---

### Task 1: Add `household_settlement` income category

**Files:**
- Modify: `lib/financeCategories.ts:3-9` (the `INCOME_CATEGORIES` array)

**Interfaces:**
- Produces: `INCOME_CATEGORIES` now includes `{ value: 'household_settlement', label: 'Household Settlement' }`, consumed by Task 3's settlement route and by MoneyLog's existing `categoryLabel()` lookup.

- [ ] **Step 1: Add the category entry**

In `lib/financeCategories.ts`, add a new entry to the `INCOME_CATEGORIES` array (after the existing `shopping_sales` entry, before `other_income`):

```ts
export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Salary' },
  { value: 'freelance', label: 'Freelance / Business' },
  { value: 'investment_returns', label: 'Investment Returns' },
  { value: 'shopping_sales', label: 'Marketplace Sales' },
  { value: 'household_settlement', label: 'Household Settlement' },
  { value: 'other_income', label: 'Other Income' },
] as const;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (the `IncomeCategory` type is derived from this array, so it widens automatically — nothing else references an exhaustive union over it).

- [ ] **Step 3: Commit**

```bash
git add lib/financeCategories.ts
git commit -m "feat(homelog): add household_settlement income category"
```

---

### Task 2: Log a MoneyLog expense when a HomeLog bill is created

**Files:**
- Modify: `app/api/homelog/expenses/route.ts` (the `POST` handler, after the existing `household_expense_splits` insert)

**Interfaces:**
- Consumes: `INCOME_CATEGORIES`/category mapping is local to this file (expense-side mapping, no import needed — it's a plain object literal).
- Consumes: existing `expense` object returned from the `household_expenses` insert (already in scope at the insertion point) — has `.category`, `.totalAmount`.
- Consumes: `body.label`, `meId`, `admin` (Supabase service-role client) — all already in scope in the existing `POST` handler.
- Produces: nothing consumed by other tasks (this is a leaf write).

- [ ] **Step 1: Add the category map and ledger insert**

In `app/api/homelog/expenses/route.ts`, add a module-level `CATEGORY_MAP` near the existing `VALID_CATEGORIES` constant:

```ts
const VALID_CATEGORIES = ['rent', 'utilities', 'groceries', 'other'];

const CATEGORY_MAP: Record<string, string> = {
  rent: 'rent',
  utilities: 'utilities',
  groceries: 'groceries',
  other: 'other_expense',
};
```

Then, immediately after the existing splits-insert error check (i.e. right after this block, so the ledger write only fires once the expense is fully persisted):

```ts
    const { error: insertSplitsError } = await admin.from('household_expense_splits').insert(
      body.splits.map((s) => ({ expenseId: expense.id, profileId: s.profileId, shareAmount: s.shareAmount }))
    );
    if (insertSplitsError) {
      await admin.from('household_expenses').delete().eq('id', expense.id);
      return NextResponse.json({ error: insertSplitsError.message }, { status: 400 });
    }

    admin
      .from('finance_transactions')
      .insert({
        profileId: meId,
        type: 'expense',
        category: CATEGORY_MAP[body.category as string] ?? 'other_expense',
        label: `HomeLog: ${body.label.trim()}`,
        amount: body.totalAmount,
      })
      .then(({ error }) => {
        if (error) console.error('homelog bill -> moneylog ledger insert failed:', error);
      });

    return NextResponse.json({ expense });
```

Note the `.then()` (not `await`) — this is what makes it fire-and-forget per the Global Constraints. The route's response still waits for the JS event loop to schedule the promise, but does not wait for it to resolve.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, then in the browser:
1. Log in as a user in a household with at least one other member.
2. Go to HomeLog → Bills, log a $90 "Groceries" expense split evenly between two members.
3. Switch to MoneyLog for the paying user. Confirm a new expense row appears: `-$90`, category "Groceries", label `HomeLog: <label you typed>`.
4. Switch to MoneyLog for the other (non-paying) member. Confirm nothing new appears there.

Expected: ledger entry appears only for the payer, with the correct amount, category, and label.

- [ ] **Step 3: Commit**

```bash
git add app/api/homelog/expenses/route.ts
git commit -m "feat(homelog): log bill payments to MoneyLog on creation"
```

---

### Task 3: Log MoneyLog transactions when a HomeLog settle-up is recorded

**Files:**
- Modify: `app/api/homelog/settlements/route.ts` (the `POST` handler, after the existing `household_settlements` insert)

**Interfaces:**
- Consumes: `household_settlement` category from Task 1 (used as a plain string literal, no import needed since this route already talks to Supabase via string-keyed `.insert()` calls, not typed enums).
- Consumes: `meId`, `toProfileId`, `amount`, `admin` — already in scope in the existing `POST` handler.
- Produces: nothing consumed by other tasks (leaf write).

- [ ] **Step 1: Add the profile lookup and dual ledger insert**

In `app/api/homelog/settlements/route.ts`, immediately after the existing settlement-insert error check and before the `return NextResponse.json({ settlement })` line:

```ts
    const { data: settlement, error: insertError } = await admin
      .from('household_settlements')
      .insert([{ householdId: membership.householdId, fromProfileId: meId, toProfileId, amount }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    admin
      .from('profiles')
      .select('id, firstName')
      .in('id', [meId, toProfileId])
      .then(({ data: names, error: namesError }) => {
        if (namesError || !names) {
          console.error('homelog settle-up -> moneylog: failed to look up names:', namesError);
          return;
        }
        const meName = names.find((p) => p.id === meId)?.firstName ?? 'Someone';
        const toName = names.find((p) => p.id === toProfileId)?.firstName ?? 'Someone';

        admin
          .from('finance_transactions')
          .insert([
            {
              profileId: meId,
              type: 'expense',
              category: 'debt_payment',
              label: `HomeLog settle-up to ${toName}`,
              amount,
            },
            {
              profileId: toProfileId,
              type: 'income',
              category: 'household_settlement',
              label: `HomeLog settle-up from ${meName}`,
              amount,
            },
          ])
          .then(({ error }) => {
            if (error) console.error('homelog settle-up -> moneylog ledger insert failed:', error);
          });
      });

    return NextResponse.json({ settlement });
```

- [ ] **Step 2: Manual verification**

Continuing from Task 2's dev server session:
1. As the member who owes money (from Task 2's split), go to HomeLog → Bills → Settle up, settle $45 with the payer.
2. Switch to MoneyLog for the settling member. Confirm a new expense row: `-$45`, category "Debt Payment", label `HomeLog settle-up to <payer's first name>`.
3. Switch to MoneyLog for the payer. Confirm a new income row: `+$45`, category "Household Settlement", label `HomeLog settle-up from <settler's first name>`.

Expected: both sides see the correct, opposite-signed entry with the right category and label.

- [ ] **Step 3: Commit**

```bash
git add app/api/homelog/settlements/route.ts
git commit -m "feat(homelog): log settle-ups to MoneyLog as a transfer pair"
```

---

### Task 4: Full type-check and final smoke test

**Files:** None (verification-only task).

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Re-run the two manual flows from Tasks 2 and 3 end-to-end in one pass**

Using the dev server: log a new bill (any category), confirm the payer's MoneyLog entry; settle it up, confirm both parties' MoneyLog entries. Also try `category: 'other'` specifically and confirm it renders as "Other" (not a raw `other_expense` slug) in MoneyLog's transaction list — this confirms `categoryLabel()` resolves the mapped value correctly.

- [ ] **Step 4: No commit needed** (verification-only task; if any fix was required, commit that fix with an appropriate message before moving on).
