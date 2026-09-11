# Codebase Review — Frontend & Backend

**Date:** 2026-09-10
**Reviewer:** Principal engineer pass (Claude Opus 5)
**Scope:** whole app — `app/` (167 API routes, 396 client components), `components/`, `lib/`, `prisma/schema.prisma`, `supabase/rls.sql`, `middleware.ts`, `next.config.ts`
**Size at review time:** ~86,300 LOC across 907 `.ts`/`.tsx` files, 109 tables

Every finding below was verified against the code in the repo at commit `74a6c2e`. Where a finding depends on live
database or hosting state that cannot be read from the repo, that is called out explicitly with the check to run.

---

## Executive summary

The per-route code quality is genuinely good: ownership checks are present and correct in the routes sampled
(`moneylog/assets/[id]`, `homelog/expenses/[id]`, `intellog/chat/[threadId]`, `homelog/shopping-list/[id]/check`),
comments explain *why* rather than *what*, and there are 198 test files with 1,009 passing tests.

The risk is not in individual files — it is in three structural choices that make a single local mistake global:

1. **Authorization has no backstop.** 130 of 167 routes use the Supabase *service-role* key, which bypasses RLS
   entirely. Every authorization decision is therefore hand-written prose in a route handler. One omission is a
   full data exposure — and there is already one (`C3`).
2. **RLS is not version-controlled with the schema.** `supabase/rls.sql` is a manual "paste into the SQL editor"
   file. 26 of 109 tables are not mentioned in it at all.
3. **Money is floating-point and non-transactional.** `Float` columns, check-then-insert balance logic, zero
   `.rpc()` calls in the entire repo, and ignored insert errors on the ledger write.

Fixing `C1`–`C8` is a few days of focused work and removes the entire class.

---

## Critical Issues

### C1 — 26 tables have no RLS statement in `supabase/rls.sql`
**Files:** `supabase/rls.sql`, `prisma/schema.prisma`

`supabase/rls.sql` contains 51 `enable row level security` statements and 96 policies. The schema declares 109
tables (`@@map` count). These tables appear nowhere in the file:

```
adminlog_announcement_banners   adminlog_app_theme_settings   adminlog_card_glow_settings
adminlog_color_combos           adminlog_lottie_animations    adminlog_lottie_assignments
adminlog_typography_settings    adminlog_ui_version_settings  ai_model_catalog
bucket_allocation_rules         bucket_entries                burnlog_workout_types
habit_occurrences               habits                        intel_chat_messages
intel_chat_threads              intel_cohort_stats            intel_snapshots
intel_suggestions               life_score_snapshots          recurring_item_occurrences
savings_buckets                 travellog_passport_entries    travellog_weekly_suggestions
watch_ignores                   watch_items
```

The file's own header states the consequence: *"every table it touches MUST have RLS enabled with a matching
policy below, or it will be either unreadable/unwritable (RLS on, no policy) or **world-readable/writable
(RLS off)**."*

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is, by design, public — it ships in the browser bundle. If RLS is off on these
tables, anyone can run this from any browser console against the production project:

```js
const sb = createClient(SUPABASE_URL, ANON_KEY);
await sb.from('intel_chat_messages').select('*');   // every user's private AI chats
await sb.from('savings_buckets').select('*');       // every user's finances
await sb.from('habits').delete().neq('id', '');     // and writes, too
```

**Failure scenario:** an attacker reads the anon key from the JS bundle (it is not a secret), and dumps
`intel_chat_messages` — which by design contains cross-app personal context assembled by
`assembleProfileContext` — for every user of the app.

**Not verifiable from the repo:** RLS may have been enabled for some of these tables directly in the Supabase
dashboard after the table was added. Run this before triaging severity:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by 1, 2
having c.relrowsecurity = false or count(p.polname) = 0
order by 1;
```

Any row returned is world-accessible with the public anon key.

**Fix:** add `enable row level security` + policies for all 26, and treat the query above as a CI gate.

---

### C2 — RLS lives outside migrations, so drift is structural
**File:** `supabase/rls.sql:1-17`

The header explains that policies were previously lost with a deleted project because they lived only in the
dashboard. The current answer — a hand-run SQL file — fixes version control but not application: nothing
guarantees the file is ever executed, and nothing fails when a new table lands without a policy. `C1` is the
proof: 26 tables have drifted since the file was written.

**Fix:** move the contents into a numbered Prisma migration (`prisma/migrations/<ts>_rls/migration.sql`) so it is
applied by the same command that creates the table, and add the `C1` query as a post-deploy assertion.

---

### C3 — `/api/invites/mark-signed-up` is an unauthenticated service-role write
**File:** `app/api/invites/mark-signed-up/route.ts:5-20`

```ts
export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const admin = createServiceRoleClient();          // bypasses RLS
  await admin.from('adminlog_invites')
    .update({ status: 'signed_up', signedUpAt: new Date().toISOString() })
    .eq('email', email).eq('status', 'pending');    // no caller identity involved
  return NextResponse.json({ ok: true });
}
```

No auth check, no caller identity, no rate limit, and the route is excluded from `middleware.ts` (the matcher
excludes `api`). Anyone on the internet can mark any pending invite as signed-up.

**Failure scenario:** attacker POSTs `{"email":"<target>"}` in a loop over a wordlist. Every pending invite flips
to `signed_up`, so the admin invite dashboard shows accepted invites for people who never signed up, and real
invitees may be blocked or mis-tracked by downstream logic. The 200-vs-silent-noop difference also makes the
route an invite-existence oracle for email enumeration.

**Fix:** this route is called during signup, so it has a session — require it:

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
// and mark only the caller's own invite — ignore the body entirely
.eq('email', user.email)
```

---

### C4 — Wallet double-spend: balance check and debit are not atomic
**File:** `app/api/moneylog/pay/route.ts:55-77`

```ts
const balance = await getBalance(admin, meId);
if (amount > balance) return NextResponse.json({ error: 'insufficient_funds', balance }, { status: 409 });
// ... later, a separate round trip:
await admin.from('payments').insert({ payerId: meId, payeeId, amount, ... })
```

The in-code comment calls this "a narrow theoretical race window." It is neither narrow nor theoretical: there is
no transaction, no row lock, no unique constraint, and no `SELECT ... FOR UPDATE`. The repo contains **zero**
`.rpc()` calls, so no money operation anywhere is atomic.

**Failure scenario:** a user with a ₹100 balance fires 10 concurrent `POST /api/moneylog/pay` requests for ₹100
each. All 10 handlers call `getBalance` before any of them inserts, all 10 see ₹100, all 10 pass the check, and
all 10 insert. The user has spent ₹1,000 they did not have, and — because `getBalance` gates
`/api/shoppinglog/checkout` — converted it into real goods. Vercel's concurrent invocations make this trivially
reproducible with `xargs -P10 curl`.

**Fix:** one Postgres function, called via `.rpc()`, that locks and checks in a single statement — see
[Refactored code example 2](#2-atomic-wallet-payment-fixes-c4-c5-c6).

---

### C5 — `pay` ignores the ledger insert error, leaving a payment with no debit
**File:** `app/api/moneylog/pay/route.ts:71-77`

Every other write in this route destructures and checks `error`. This one does not:

```ts
await admin.from('finance_transactions').insert([ /* expense for payer, income for payee */ ]);
return NextResponse.json({ paymentId: payment.id, balance: balance - amount });
```

**Failure scenario:** the `finance_transactions` insert fails (constraint violation, a bad `category` value from
the request body — which is never validated against an allowlist — connection blip). The `payments` row already
exists. The route returns `200` with a `paymentId`. Because `getBalance` is computed *only* from
`finance_transactions`, the payer was never debited. The buyer then passes that `paymentId` to
`/api/shoppinglog/checkout`, which validates payer/payee/amount against the `payments` row, finds it consistent,
and creates the order. Free goods, and the seller's income row is missing too.

**Fix:** the same RPC as `C4` — insert payment and both ledger rows in one transaction, or check the error and
delete the orphaned payment row.

---

### C6 — `getBalance` sums every row in the app process and is silently truncated
**File:** `lib/moneylog/balance.ts:14-27`

```ts
const { data } = await admin.from('finance_transactions').select('type, amount').eq('profileId', profileId);
let balance = 0;
for (const row of data ?? []) balance += row.type === 'income' ? row.amount : -row.amount;
```

Two problems, one of which is a correctness bug:

1. **Truncation.** Supabase's PostgREST sets `db-max-rows` to 1,000 by default. Once a profile has more than
   1,000 `finance_transactions` rows, this returns the first 1,000 and the function reports a *wrong balance* —
   with no error, no warning, and no pagination. Confirm the project's setting under
   *Settings → API → Max rows*. Given this gates real payments (`C4`) and ShoppingLog checkout, a wrong balance
   is either a free-money bug or a user locked out of their own funds, depending on which rows got cut.
2. **Cost.** It transfers the user's entire financial history over the wire and sums it in Node on every payment,
   every checkout, and every admin wallet adjustment. It grows without bound and never gets faster.

**Fix:** aggregate in Postgres.

```sql
create or replace function wallet_balance(p_profile_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
  from finance_transactions where "profileId" = p_profile_id;
$$;
```

---

### C7 — Money is stored as floating point
**File:** `prisma/schema.prisma` — `Payment.amount:567`, `FinanceTransaction.amount:649`,
`HouseholdExpense.totalAmount:1399`, `ExpenseShare.amount:1428`, `ShopListing.price:1456`,
`ShopOrder.totalAmount:1517`, `ShopOrderItem.price:1535`, and more

`Float` in Prisma is `double precision` in Postgres. Currency in binary floating point accumulates error that no
amount of care in the application layer removes. The symptom is already in the code as a workaround:

```ts
// app/api/shoppinglog/checkout/route.ts:80
if (Math.abs(totalAmount - payment.amount) > 0.01) { /* reject */ }
```

**Failure scenario (drift):** a household expense of ₹100 split three ways stores `33.333333333333336`; the
shares no longer sum to the total, and the "settled up" check in `homelog/balances` never reaches zero.

**Failure scenario (exploit):** the `0.01` tolerance is a free discount window. A buyer pays
`total - 0.009` per order; `checkout` accepts the mismatch and creates the order at the seller's full price.
Small per order, unbounded in aggregate, and invisible in reporting because the drift looks like float noise.

**Fix:** `Decimal @db.Decimal(12, 2)` (or integer minor units) for every money column, and exact comparison at
the boundary. This is a migration with a backfill, so it wants planning — but it gets worse the longer it waits.

---

### C8 — Checkout oversells stock
**File:** `app/api/shoppinglog/checkout/route.ts:68-108`

Stock is filtered in JS (`r.listing.stockQuantity >= r.quantity`), then written back as a computed absolute value:

```ts
for (const i of sellerItems) {
  const remaining = i.listing!.stockQuantity - i.quantity;
  await admin.from('shop_listings')
    .update({ stockQuantity: remaining, status: remaining <= 0 ? 'sold' : 'active' })
    .eq('id', i.listing!.id);           // unconditional — last writer wins
}
```

**Failure scenario:** one unit in stock, two buyers check out simultaneously. Both read `stockQuantity: 1`, both
pass the filter, both write `stockQuantity: 0`. Two orders exist for one unit. With larger quantities the column
goes negative, and `status` is computed from the stale read so a sold-out listing can stay `active`.

**Fix:** conditional update, and verify it applied:

```ts
const { data: claimed } = await admin.from('shop_listings')
  .update({ stockQuantity: i.listing!.stockQuantity - i.quantity })
  .eq('id', i.listing!.id)
  .gte('stockQuantity', i.quantity)     // only if still available
  .select('id, stockQuantity');
if (!claimed?.length) { /* roll back the order, return 409 */ }
```

Better: move the whole checkout into one RPC so order + items + stock + cart are one transaction. Today an
`shop_order_items` insert failure (also unchecked, line 91) leaves an order with no line items.

---

### C9 — `npm test` is red on `master`
**Files:** `app/api/loading-animations/route.test.ts`, `app/api/loading-animations/[id]/route.test.ts`

```
Test Files  6 failed | 155 passed (161)
      Tests  6 failed | 1009 passed (1015)

FAIL  app/api/loading-animations/route.test.ts > returns 401 when unauthenticated
FAIL  app/api/loading-animations/[id]/route.test.ts > returns 401 when unauthenticated
AssertionError: expected 500 to be 401
```

Both routes were deliberately changed to public reads — the route comments say so explicitly ("Public read —
SwitchLoader fetches [this] on every page, including logged-out ones like /login"). The tests asserting `401`
were never updated. The suite has been red since that change, which means every subsequent regression has landed
into an already-failing suite.

**Fix:** update both tests to assert the current public contract (200 + shape, 404 for a missing id), and add a
CI gate on `npm test` so this cannot recur. The other 4 failures are `H8`.

---

## High

### H1 — No rate limiting anywhere, including on endpoints that spend money
A repo-wide search for `ratelimit|rate-limit|throttle` returns **zero** hits across 167 routes. Several of those
routes call OpenRouter with real credits (`lib/ai/openrouter.ts`), and `lib/ai/jobs.ts` logs spend to `ai_jobs`
but never enforces a quota.

**Failure scenario:** any authenticated user loops `POST /api/intellog/chat/[threadId]` and burns the
project-wide `NEXT_OPENROUTER_KEY` budget. There is no per-profile ceiling to stop them, and `ai_jobs` records
the damage after the fact. Same shape on `/api/invites/mark-signed-up` (`C3`), which is unauthenticated.

**Fix:** a per-profile token bucket in Postgres (or Upstash) in a shared wrapper, plus a daily `ai_jobs`-backed
spend cap checked inside `runAiJob`.

### H2 — 89 request bodies are type-asserted, never validated
`grep 'await request.json()' app/api` → 89 sites, every one of them followed by `as SomeBody`. `as` is erased at
compile time; it guarantees nothing at runtime. `zod` is not a dependency.

Concrete crash — `app/api/moneylog/assets/[id]/route.ts:105`:

```ts
const { name } = (await request.json()) as PatchBody;   // name: string | undefined
if (name !== undefined) {
  if (name.trim().length === 0) { ... }                 // TypeError if name is 42
```

`PATCH {"name": 42}` → `name.trim is not a function` → the catch block returns a generic 500 for what is a 400.
The same shape recurs wherever a string field is trimmed or a nested object is destructured. Related: `pay`
accepts any `category` string with no allowlist, and `intellog/chat` forwards a client-supplied `model` straight
to OpenRouter and persists it to `intel_chat_threads.modelId` without checking it against `ai_model_catalog`.

**Fix:** one `zod` schema per route, parsed in a shared `parseBody(request, schema)` helper that returns 400 with
field errors. This is mechanical and can be done incrementally, highest-risk routes first.

### H3 — The service-role client is the default data path (130 of 167 routes)
`createServiceRoleClient()` bypasses RLS completely, so for those routes the *only* thing standing between a user
and everyone else's data is hand-written prose in the handler. The routes sampled do this correctly and carefully.
That is not the problem — the problem is that correctness is unverifiable at scale and unenforced by anything.
`C3` is what one omission costs.

**Fix:** invert the default. Use the RLS-respecting `lib/supabase/server.ts` client for user-scoped reads and
writes, and reserve the service-role client for genuinely cross-user work (cron, admin, public reads). Then RLS
becomes the backstop it was written to be, and a forgotten `.eq('profileId', me)` fails closed instead of open.

### H4 — A live TMDB bearer token is committed to the repo
**File:** `lib/watchlog/tmdb.ts:13` — a full `eyJ...` JWT as a hardcoded fallback.

It is in git history, so rotating the env var alone is not sufficient.

**Fix:** rotate the token in TMDB, set the deployment env var, delete the literal, and throw on a missing env var
the way `lib/supabase/serviceRole.ts` already does. (This is already tracked as known debt — it is still open.)

### H5 — Pinch-zoom is disabled app-wide (WCAG 1.4.4 failure)
**File:** `app/layout.tsx:18-25` — `maximumScale: 1, userScalable: false`

The comment documents a real bug this was fighting (iOS keyboard/scroll reset). The fix, however, removes zoom
for every user on every page — a hard accessibility failure for anyone with low vision, and an App Store
accessibility-review risk.

**Fix:** drop `maximumScale`/`userScalable` and prevent iOS's *auto*-zoom-on-focus the targeted way — give every
input a computed `font-size >= 16px`. iOS only auto-zooms below that threshold. `KeyboardFocusScroll` already
handles the scroll half.

### H6 — Raw database error messages are returned to clients
e.g. `app/api/shoppinglog/checkout/route.ts:88`, `app/api/homelog/expenses/[id]/route.ts:38`,
`app/api/homelog/shopping-list/[id]/check/route.ts:48`:

```ts
return NextResponse.json({ error: deleteError.message }, { status: 400 });
```

Postgres errors name tables, columns, and constraints. That is free schema reconnaissance, and it is inconsistent
with the rest of the codebase, which correctly logs server-side and returns a generic message.

**Fix:** log `error`, return a fixed user-facing string. A `respondError(error, publicMessage)` helper makes the
right thing the easy thing.

### H7 — Check-then-act on state transitions (TOCTOU)
**File:** `app/api/homelog/shopping-list/[id]/check/route.ts:37-46` is the clearest instance:

```ts
if (item.checkedAt) return NextResponse.json({ error: 'Already checked off' }, { status: 400 });
await admin.from('household_shopping_list_items').update({ checkedAt: new Date().toISOString() }).eq('id', id);
```

**Failure scenario:** two household members tap the same item at once. Both read `checkedAt: null`, both update,
both fire `notifyHouseholdExceptActor`, and the inventory top-up on line 60 runs twice — so `quantity` is set to
`lowStockThreshold + 1` twice (idempotent here by luck, since it assigns rather than increments). Everyone gets
two push notifications for one checkoff.

Also on line 63: `quantity: inventoryItem.lowStockThreshold + 1` — if `lowStockThreshold` is null, JS evaluates
`null + 1` to `1`, silently setting the wrong restock quantity instead of failing.

**Fix:** make the update the guard — `.is('checkedAt', null)` plus `.select()`, and treat an empty result as the
409. Then notify only when you won the race.

### H8 — The test runner executes stale worktree copies of the repo
**File:** `vitest.config.ts` — no `exclude`

4 of the 6 failures come from `.claude/worktrees/design-audit-fixes/` and
`.claude/worktrees/moneylog-savings-buckets/` — old copies of the tree, running old code, asserting old
contracts. They inflate the failure count, slow the run, and make a genuine regression easy to dismiss as
"just the worktree ones."

**Fix:**

```ts
test: { environment: 'node', exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'] }
```

---

## Improvements & Refactoring

### M1 — 16 Google font families load on every page for an admin-only preference
**File:** `app/RootLayoutClient.tsx:1-70+`

Quicksand, Figtree, Geist Mono, Poppins, Inter, Krona One, Prata, Lexend, Calistoga, Mulish, Work Sans, Bevan,
Fraunces, Archivo, Righteous, Arimo — all imported unconditionally. The comment is explicit about why: *"always
loaded so switching the setting doesn't need a page reload."* Every user on every visit pays the download and
render cost of 14 fonts they will never see, so one admin avoids one refresh. This is likely the single largest
LCP contributor on the app.

**Fix:** load the two active families statically; inject the admin's alternate via a `<link>` at runtime when
`TypographySettingsEffect` resolves a non-default choice. The admin's refresh is a fine price.

### M2 — The entire app is a client component tree
`app/layout.tsx` renders `RootLayoutClient`, which is `"use client"`, and 396 files carry the directive. Every
React Server Component benefit — zero-JS pages, server data fetching, smaller bundles — is forfeited at the root.
The comment justifies the *layout split* (the `viewport` export), which is correct; what it does not justify is
`"use client"` sitting above `{children}`.

**Fix:** keep `RootLayoutClient` for the providers that truly need state, but make it a leaf-wrapping provider
component rather than the root, so individual pages can be server components. Incremental: convert the heaviest
read-only pages first.

### M3 — `backdrop-filter: blur(0px)` on every card, button, input and nav
**File:** `app/globals.css:218,223,1153,1161` — the v1 tokens set `--surface-*-blur: 0px`, and `.surface-card` etc.
apply `backdrop-filter: blur(var(--surface-card-blur))` unconditionally.

`blur(0px)` is not a no-op. Any non-`none` `backdrop-filter` promotes the element to its own compositing layer and
makes it a containing block for fixed/absolute descendants. On the v1 (default, non-glass) path every card, every
themed button, and the bottom nav pay that cost for zero visual effect — and any `position: fixed` child inside a
card is now positioned relative to the card, not the viewport, which is a subtle-bug generator.

**Fix:** apply `backdrop-filter` only under the v2 selector:

```css
:root[data-ui-version="v2"] .surface-card { backdrop-filter: blur(var(--surface-card-blur)); }
```

### M4 — 50 components fetch in `useEffect`; exactly 1 file uses `AbortController`
With 22 `react-hooks/exhaustive-deps` suppressions alongside. `swr` is already a dependency and used in 94 files —
so two data-fetching conventions coexist, and the manual one has no cancellation, no dedupe, and no revalidation.

**Failure scenario:** the user switches tabs/filters faster than the network responds; the first response lands
after the second and overwrites fresh data with stale. The `eslint-disable` comments hide exactly the dependency
that would have surfaced it.

**Fix:** move these to `useSWR` with a keyed cache. Where a manual effect must stay, thread an `AbortSignal`
through and abort in the cleanup.

### M5 — Cron jobs iterate every profile serially
**File:** `app/api/cron/intel-snapshot/route.ts:20-42` — nested `for` over all profiles × all
`SNAPSHOT_EXTRACTORS`, each `await`ed one at a time, with an `upsert` per pair. Runtime grows linearly with the
user base and will hit the function timeout; there is no batching, no concurrency limit, and no resume point, so
a timeout silently loses the tail of the user list. Same shape in `intel-suggest`, `evening-checkin`,
`scheduled-reminders`, `travellog-weekly-suggestions`.

**Fix:** chunk profiles (say 25 at a time) through a bounded `Promise.all`, batch the upserts per chunk, and
persist a cursor so a timed-out run resumes instead of restarting.

### M6 — Production dependencies that are not runtime dependencies
- `@prisma/client` — grep finds **zero** runtime imports. Prisma is migrations-only here; all queries go through
  `supabase-js`. It belongs in `devDependencies`.
- `shadcn-ui` — a scaffolding CLI, listed under `dependencies`. Components are vendored into `components/ui/`.
  Also `devDependencies` at most.

Related: because nothing generates Supabase `Database` types, every query is untyped — which the code openly
works around, e.g. `app/api/loading-animations/route.ts:29`
(*"Supabase's select-string type inference can't see this repo's schema (no generated Database types)"*), and 32
`as any`/`: any` escapes repo-wide. `supabase gen types typescript` would remove that whole class of cast.

### M7 — `getMyProfileId` is copy-pasted instead of imported
`lib/homelog/serverAuth.ts` exports it, and `intellog/chat/[threadId]` imports it correctly. But
`moneylog/assets/[id]`, `shoppinglog/checkout`, `moneylog/pay` and others each redeclare an identical local copy,
and `sociallog/posts/[id]/vote` inlines the query outright. Four spellings of the same authorization primitive is
how one of them eventually drifts.

**Fix:** one `lib/auth/requireProfile(request)` that returns `{ user, profileId }` or a `Response`, imported
everywhere. That also becomes the natural place to hang rate limiting (`H1`) and body validation (`H2`).

### M8 — No CSP on application pages
**File:** `next.config.ts:19-37` — `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` are set
globally (good), and a strict CSP is set on `/sw.js` only. Application pages have no
`Content-Security-Policy`, no `Strict-Transport-Security`, and no `Permissions-Policy`.

**Fix:** add a report-only CSP first (nonce-based, since Next injects inline scripts), review the reports, then
enforce. Add HSTS with `includeSubDomains; preload`, and a `Permissions-Policy` that denies the sensors the app
does not use.

---

## UI/UX Feedback

`components/GlobalSearch.tsx` is the most recently touched UI and is reviewed line by line. Most points generalize
to the other overlay/list surfaces.

### U1 — The result list has no combobox semantics (blocking a11y)
The input is a plain `<Input>` and the results are a plain `<div>` of `<button>`s. There is no `role="combobox"`,
`aria-expanded`, `aria-controls`, `aria-autocomplete` on the input; no `role="listbox"` on the container; no
`role="option"`/`aria-selected` on the items; and no `aria-activedescendant` tying the `highlighted` state to
anything a screen reader can perceive. Arrow keys move a purely visual highlight (`index === highlighted ?
'bg-accent'`). A screen-reader user gets a text field that silently does nothing, and no announcement that N
results appeared.

### U2 — The highlighted result is never scrolled into view
The container is `max-h-64 overflow-y-auto`. `handleKeyDown` advances `highlighted` up to `filtered.length - 1`
with no `scrollIntoView`. Past roughly the fourth result the selection moves off-screen: the user presses
Enter and navigates somewhere they were never shown.

### U3 — The app-color swatch breaks for any non-hex theme color
`components/GlobalSearch.tsx:126` — `style={{ backgroundColor: `${color}1a` }}` appends a hex alpha byte and
assumes `color` is always `#rrggbb`. But `colorFor` returns whatever an admin saved, and
`lib/theme/appTheme.ts:62` accepts three formats:

```ts
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|oklch\([^)]+\))$/;
```

**Failure scenario:** an admin sets BurnLog's primary to `oklch(0.7 0.2 40)` in AdminLog → App Theme. This
produces `backgroundColor: "oklch(0.7 0.2 40)1a"` — invalid CSS, silently dropped. Every search result's icon
badge loses its tint, with no error anywhere. A 3-digit hex (`#f80`) fails the same way.

**Fix:** `color-mix(in oklab, ${color} 10%, transparent)`, which is format-agnostic, and keep `color` itself for
the icon.

### U4 — The overlay cannot be dismissed by tapping outside it
It is shown whenever `debouncedQuery.trim() !== ''` and hidden only by clearing the query or pressing Escape.
There is no outside-click handler and no blur dismissal. On mobile — the primary target, given the Capacitor
setup — the results float over the page content with no way to dismiss them except finding the small `×`.

### U5 — A 150ms debounce on an in-memory array
`SEARCH_REGISTRY` is a local constant; `filtered` is a synchronous `Array.filter`. The debounce adds 150ms of
latency to every keystroke and buys nothing — there is no network call and no expensive computation to coalesce.
It also decouples what is rendered from what is typed, so Enter can fire against a list computed from the
previous keystroke.

**Fix:** filter `query` directly. Keep debouncing for whenever this gains a server-backed source.

### U6 — No ranking and no result cap
Matching is `includes()` across label, description, and app name, returning registry order. A query that exactly
matches a page's label can rank below an incidental description match. There is also no `slice` — fine at today's
registry size, a scroll-jail once it grows.

**Fix:** score matches (exact label > label prefix > label substring > description), sort, and cap at ~8.

### U7 — The clear button misses the touch-target and focus-ring floor
`components/GlobalSearch.tsx:105` is a bare `<button>` wrapping a 16px icon: roughly 16×16px of hit area against
the 44×44px iOS / 24×24px WCAG 2.2 minimum, and no `focus-visible` ring, so keyboard users cannot see it. It also
sits inside the input row, so tapping it blurs the field and dismisses the keyboard mid-search.

**Fix:** `-m-2 p-2 rounded focus-visible:ring-2 focus-visible:ring-ring` and
`onMouseDown={(e) => e.preventDefault()}` to keep focus in the input.

### U8 — Escape does two things at once
Escape clears the query *and* blurs the input. The convention users expect is: first Escape closes the results and
keeps the query, second Escape clears. As written, one stray Escape loses what they typed.

### U9 — Z-index is ad-hoc across the app
14 distinct values in use: `z-50` (24 call sites), `z-10` (49), plus `z-[9]`, `z-[60]`, `z-[70]`, `z-[100]`,
`z-[110]`, `z-[120]`. This overlay is `z-50` — the same layer as 23 other things, including drawers and the nav
shell, so which one wins depends on DOM order.

**Fix:** a named scale in `globals.css` (`--z-nav`, `--z-overlay`, `--z-drawer`, `--z-toast`) and a lint rule
against raw `z-[...]`.

### U10 — `prefers-reduced-motion` is honored in 2 places out of 35 motion-using files
35 files import from `motion`, plus the animated icon set, the siri-orb, flow-field, and dotted-glow backgrounds.
Only 2 files reference `prefers-reduced-motion`. For users with vestibular disorders the app has no way to calm
down, and AdminLog → Micro Interactions is a global admin switch, not a user preference.

**Fix:** one `useReducedMotion()` gate in the shared animation wrappers, and a global
`@media (prefers-reduced-motion: reduce)` block that neutralizes the decorative backgrounds.

### Minor UI notes
- `components/ui/chart.tsx:81` is the only `dangerouslySetInnerHTML` in the repo. It injects generated CSS, not
  user content, so it is safe today — worth a comment saying so, since it will read as a red flag to the next
  reviewer.
- 33 `key={index}` usages. Harmless in static lists, a state-mismatch bug the moment the list reorders or filters.
- 18 stray `console.log` calls in shipped code.

---

## Refactored Code Examples

### 1. `components/GlobalSearch.tsx` (fixes U1–U8)

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { SearchIcon, type SearchIconHandle } from '@/components/ui/search';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { APPS, getActiveApp } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { SEARCH_REGISTRY, type SearchItem } from '@/lib/search/registry';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';

const MAX_RESULTS = 8;
const LISTBOX_ID = 'global-search-results';
const optionId = (i: number) => `${LISTBOX_ID}-option-${i}`;

/** Exact label > label prefix > label substring > app name > description.
 *  Returns null for a miss so the caller can filter and sort in one pass. */
function score(item: SearchItem, q: string): number | null {
  const label = item.label.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q)) return 2;
  if (APPS[item.app].name.toLowerCase().includes(q)) return 3;
  if (item.description.toLowerCase().includes(q)) return 4;
  return null;
}

interface GlobalSearchProps {
  /** Called after navigating to a result — e.g. to close a parent drawer. */
  onNavigate?: () => void;
  placeholder?: string;
}

export function GlobalSearch({ onNavigate, placeholder }: GlobalSearchProps) {
  const router = useRouter();
  const { switchTo } = useAppSwitch();
  const { colorFor } = useAppThemeColors();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchIconRef = useRef<SearchIconHandle>(null);
  useMountAnimation(searchIconRef);

  // No debounce: SEARCH_REGISTRY is an in-memory constant, so filtering is
  // synchronous and debouncing only decoupled the rendered list from what
  // the user had typed (Enter could fire against the previous keystroke).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_REGISTRY.flatMap((item) => {
      const s = score(item, q);
      return s === null ? [] : [{ item, s }];
    })
      .sort((a, b) => a.s - b.s)
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [query]);

  const showList = open && query.trim() !== '';

  useEffect(() => setHighlighted(0), [query]);

  // Keep the active option visible — the list is max-h-64 and scrolls, so a
  // purely visual highlight could sit off-screen while Enter navigated to it.
  useEffect(() => {
    if (!showList) return;
    listRef.current?.querySelector(`#${optionId(highlighted)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, showList]);

  // Dismiss on outside pointer-down (mobile has no other affordance).
  useEffect(() => {
    if (!showList) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showList]);

  const goTo = useCallback((item: SearchItem) => {
    setQuery('');
    setOpen(false);
    onNavigate?.();
    // Jumping into a different app: go through switchTo so the app-switch
    // loader plays and app-scoped storage/theme get reset, same as using
    // the app switcher. Staying within the current app is a plain nav.
    if (getActiveApp() !== item.app) switchTo(item.app, item.href);
    else router.push(item.href);
  }, [onNavigate, router, switchTo]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        setHighlighted((h) => (results.length ? (h + 1) % results.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((h) => (results.length ? (h - 1 + results.length) % results.length : 0));
        break;
      case 'Enter': {
        if (!showList) return;
        e.preventDefault();
        const item = results[highlighted];
        if (item) goTo(item);
        break;
      }
      case 'Escape':
        // First Escape closes the list but keeps the query; a second one
        // clears it. Collapsing both into one keypress lost typed input.
        e.preventDefault();
        if (showList) setOpen(false);
        else { setQuery(''); inputRef.current?.blur(); }
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <div className="surface-search flex items-center gap-2 rounded-lg border px-3">
        <SearchIcon ref={searchIconRef} size={16} className="shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Search anything across every app…'}
          // Combobox semantics: without these the arrow-key highlight is
          // invisible to assistive tech and the result list is never
          // announced at all.
          role="combobox"
          aria-expanded={showList}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[highlighted] ? optionId(highlighted) : undefined}
          className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {query && (
          <button
            type="button"
            // Negative margin + padding lifts the hit area to 32px without
            // changing layout; preventDefault keeps focus in the input so
            // clearing doesn't dismiss the mobile keyboard.
            className="-m-2 rounded p-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Announced out-of-band so SR users hear the count change. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showList ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
      </span>

      {showList && (
        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Search results"
          className="surface-card absolute inset-x-0 top-full z-[var(--z-overlay,50)] mt-2
                     flex max-h-64 flex-col gap-1 overflow-y-auto border p-1"
        >
          {results.length === 0 && (
            <p className="p-3 text-center text-sm text-muted-foreground">No matching pages</p>
          )}
          {results.map((item, index) => {
            const Icon = item.icon;
            const color = colorFor(item.app);
            return (
              <button
                key={`${item.app}-${item.href}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlighted}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goTo(item)}
                onPointerEnter={() => setHighlighted(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors',
                  index === highlighted ? 'bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  // color-mix instead of `${color}1a`: colorFor can return
                  // rgb()/oklch() (see isValidCssColor), and appending a hex
                  // alpha byte to those produces invalid CSS that silently
                  // drops the tint.
                  style={{ backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.label}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {APPS[item.app].name}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### 2. Atomic wallet payment (fixes C4, C5, C6)

The route cannot fix these in TypeScript — the check and the writes have to be one statement. Add a migration:

```sql
-- prisma/migrations/<timestamp>_wallet_pay_rpc/migration.sql

-- Server-side aggregate: replaces lib/moneylog/balance.ts's fetch-all-rows
-- loop, which was silently truncated by PostgREST's 1000-row cap.
create or replace function wallet_balance(p_profile_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
  from finance_transactions where "profileId" = p_profile_id;
$$;

-- Check + debit + credit in one transaction. The advisory lock serializes
-- concurrent payments from the same payer, which is what made the old
-- check-then-insert a double-spend: N parallel requests all read the same
-- balance before any of them wrote.
create or replace function wallet_pay(
  p_payer uuid, p_payee uuid, p_amount numeric,
  p_category text, p_source_app text, p_memo text
) returns table (payment_id uuid, new_balance numeric)
language plpgsql security definer as $$
declare
  v_balance numeric;
  v_payment uuid;
  v_payer_name text;
  v_payee_name text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_payer = p_payee then
    raise exception 'self_payment' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_payer::text, 0));

  select wallet_balance(p_payer) into v_balance;
  if p_amount > v_balance then
    raise exception 'insufficient_funds' using errcode = 'P0001';
  end if;

  select username into v_payer_name from profiles where id = p_payer;
  select username into v_payee_name from profiles where id = p_payee;
  if v_payee_name is null then
    raise exception 'payee_not_found' using errcode = 'P0002';
  end if;

  insert into payments ("payerId", "payeeId", amount, "sourceApp", category, memo)
  values (p_payer, p_payee, p_amount, p_source_app, p_category, p_memo)
  returning id into v_payment;

  -- Same transaction as the payment row: a failure here can no longer leave
  -- a payment with no ledger entries, which checkout would have honoured.
  insert into finance_transactions ("profileId", type, category, label, amount, "paymentId")
  values
    (p_payer, 'expense', p_category,
     coalesce('Payment to @' || v_payee_name || ': ' || p_memo, 'Payment to @' || v_payee_name),
     p_amount, v_payment),
    (p_payee, 'income', p_category,
     coalesce('Payment from @' || v_payer_name || ': ' || p_memo, 'Payment from @' || v_payer_name),
     p_amount, v_payment);

  return query select v_payment, wallet_balance(p_payer);
end;
$$;
```

The route reduces to validation plus one call:

```ts
// app/api/moneylog/pay/route.ts
const { data, error } = await admin.rpc('wallet_pay', {
  p_payer: meId, p_payee: payeeId, p_amount: amount,
  p_category: category, p_source_app: sourceApp, p_memo: memo ?? null,
}).single();

if (error) {
  const status = { insufficient_funds: 409, payee_not_found: 404, self_payment: 400, invalid_amount: 400 }[error.message] ?? 500;
  if (status === 500) console.error('moneylog pay error:', error);
  return NextResponse.json(
    { error: status === 500 ? 'Internal server error' : error.message },
    { status }
  );
}
return NextResponse.json({ paymentId: data.payment_id, balance: data.new_balance });
```

Note this still stores `numeric` into `double precision` columns until `C7` is migrated — do `C7` in the same
change if you can, since the columns are being touched anyway.

---

## Suggested sequencing

| Order | Work | Why first |
|---|---|---|
| 1 | `C1` verification query + `C3` auth fix | Both are minutes of work; `C1` may be an active exposure |
| 2 | `C9`, `H8` — get the suite green and honest | Nothing below is safe to land against a red suite |
| 3 | `C4`, `C5`, `C6` via the `wallet_pay` RPC | Real money, actively exploitable |
| 4 | `C8` conditional stock update; `C2` RLS into migrations | Same class, contained blast radius |
| 5 | `H1` rate limiting, `H2` zod at the boundary | Needs the `M7` shared helper; do them together |
| 6 | `C7` money → `Decimal` | Migration + backfill; plan it, don't rush it |
| 7 | `H5`, `U1`, `U2`, `U10` — accessibility | Independent of everything above, can run in parallel |
| 8 | `M1`, `M2`, `M3` — performance | Largest user-visible win per hour spent |

## What is working well

Worth stating, because a findings list reads more negative than the codebase deserves:

- **Comments explain decisions, not mechanics.** `middleware.ts`'s note on `getUser()` vs `getSession()`,
  `app/layout.tsx`'s viewport split, the lottie matcher exclusion, `lib/ai/jobs.ts`'s cross-instance cancel
  caveat — this is the kind of context that is normally lost. It made this review faster and it will pay off on
  every future change.
- **Ownership checks in the sampled routes are correct and consistent** in shape: authenticate → resolve profile →
  load row → compare owner → act, with `404` rather than `403` where existence itself is sensitive.
- **1,009 passing tests** including route-level tests — an unusually good position to refactor from.
- **`lib/adminlog/nav.ts` and `lib/ai/modelConfig.ts`** are proper single sources of truth, consumed in several
  places rather than duplicated.
- **`lib/supabase/serviceRole.ts` fails loudly** on missing configuration instead of limping along with
  `undefined` — the pattern `lib/watchlog/tmdb.ts` (`H4`) should copy.
