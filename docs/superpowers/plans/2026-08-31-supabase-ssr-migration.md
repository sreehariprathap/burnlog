# Supabase SSR Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated `@supabase/auth-helpers-nextjs` package with `@supabase/ssr` across the whole app so `cookies()` is properly awaited and the "Route ... used `cookies().get(...)`. `cookies()` should be awaited" errors go away for good.

**Architecture:** Two new factory modules — `lib/supabase/server.ts` (async, for Server Components and Route Handlers, backed by `next/headers` `cookies()`) and `lib/supabase/client.ts` (sync, for Client Components, backed by `createBrowserClient`) — replace the old `createServerComponentClient`/`createRouteHandlerClient`/`createClientComponentClient` calls one-for-one. `middleware.ts` gets its own inline `createServerClient` wired to the request/response cookie jars, per Supabase's documented middleware pattern. Every call site's transformation is mechanical and identical within its category (server vs. client), so files are migrated in directory-scoped batches rather than one task per file — each batch still gets its own typecheck + smoke test + commit.

**Tech Stack:** Next.js 15 (App Router, Turbopack), `@supabase/ssr`, `@supabase/supabase-js` (already at `^2.49.4`, unchanged), TypeScript.

**Spec:** No separate spec doc — this plan implements the fix described in the session where the `cookies()` sync-dynamic-API warnings were diagnosed (see conversation: `@supabase/auth-helpers-nextjs` calls `cookies()` synchronously internally, which Next.js 15 no longer allows).

## Global Constraints

- Do not change `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var names — reuse exactly as read today in `lib/supabase.ts`.
- Do not touch `lib/supabase.ts` (anon browser client used outside component tree) or `lib/supabase/serviceRole.ts` (service-role client) — both already use `@supabase/supabase-js` directly and are unaffected by this migration.
- No test framework exists in this repo (no jest/vitest configured) — verification per task is `npx tsc --noEmit` plus a manual dev-server smoke check of the affected route(s)/page(s), matching how this app has been verified in prior sessions.
- Every migrated file must end up with **zero** remaining imports from `@supabase/auth-helpers-nextjs`.
- Preserve existing behavior exactly — this is a mechanical API-surface swap, not a chance to change auth logic, redirects, or error handling.

---

## File Structure

**Create:**
- `lib/supabase/server.ts` — async `createClient()` for Server Components + Route Handlers.
- `lib/supabase/client.ts` — sync `createClient()` for Client Components.

**Modify:**
- `middleware.ts` — swap `createMiddlewareClient` for `createServerClient` with a request/response cookie adapter.
- 131 files across `app/**`, `components/**`, `lib/**` — swap old factory import + call for the new one (list per task below).

**Remove (final task only):**
- `@supabase/auth-helpers-nextjs` and `@supabase/auth-helpers-react` from `package.json`.

---

### Task 1: Add `@supabase/ssr` and create the two factory modules

**Files:**
- Modify: `package.json` (add dependency)
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

**Interfaces:**
- Produces: `createClient(): Promise<SupabaseClient>` from `@/lib/supabase/server` (async — call sites must `await` it).
- Produces: `createClient(): SupabaseClient` from `@/lib/supabase/client` (sync — no `await`).

- [ ] **Step 1: Install `@supabase/ssr`**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: Create the server factory**

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — safe to ignore
            // because middleware refreshes the session on every request.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create the browser factory**

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from these two files (existing unrelated errors, if any, are out of scope).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/supabase/server.ts lib/supabase/client.ts
git commit -m "feat: add @supabase/ssr server/browser client factories"
```

---

### Task 2: Migrate `middleware.ts`

**Files:**
- Modify: `middleware.ts:1-9` (imports + client creation only — routing logic below is unchanged)

**Interfaces:**
- Consumes: nothing from Task 1 (middleware can't use `next/headers` `cookies()`, so it builds its own `createServerClient` inline rather than using `lib/supabase/server.ts`).

- [ ] **Step 1: Replace the import and client creation**

Before:
```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createMiddlewareClient({ req: request, res: response });
  const { data: { user } } = await supabase.auth.getUser();
```

After:
```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
```

Everything after this point in `middleware.ts` (the `publicRoutes` checks, redirects, profile lookup, final `return response;`) stays exactly as-is — `response` is now `let` instead of `const` so the cookie-refresh reassignment inside `setAll` compiles.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `middleware.ts`.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, then visit `http://localhost:3000/` while logged out (expect redirect to `/login`) and while logged in (expect redirect to `/logbook` if hitting `/login`, or normal page load otherwise). Confirm no `cookies()` sync warning appears in the terminal for this request.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "fix: migrate middleware to @supabase/ssr createServerClient"
```

---

### Task 3: Migrate the 3 Server Component pages

**Files:**
- Modify: `app/page.tsx:2,8`
- Modify: `app/(burnlog)/insights/page.tsx:5,16`
- Modify: `app/(moneylog)/moneylog/insights/page.tsx` (import + call, same pattern)

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the transformation to each file**

In each of the 3 files:
- Replace `import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';` with `import { createClient } from '@/lib/supabase/server';`
- Remove any now-unused `import { cookies } from 'next/headers';` only if nothing else in the file uses `cookies` directly (check first — `createServerComponentClient({ cookies })` passed the function itself, so it's likely safe to remove, but confirm no other usage).
- Replace `const supabase = createServerComponentClient({ cookies });` with `const supabase = await createClient();`
- The enclosing functions (`Home`, `Insights` page components) are already `async` — no signature change needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these 3 files.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, visit `/`, `/insights` (BurnLog), `/moneylog/insights`. Confirm each loads with a 200 and no `cookies()` warning in the terminal.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx "app/(burnlog)/insights/page.tsx" "app/(moneylog)/moneylog/insights/page.tsx"
git commit -m "fix: migrate server-component pages to @supabase/ssr"
```

---

### Task 4: Migrate `app/api/logbook/*` route handlers

**Files:**
- Modify: `app/api/logbook/calendar/route.ts:10,11` (and any other line matching the pattern)
- Modify: `app/api/logbook/today/route.ts`
- Modify: `app/api/logbook/weekly/route.ts`
- Modify: `app/api/logbook/correlation/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the transformation to each file**

Before:
```ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
```

After:
```ts
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
```

Remove the `import { cookies } from 'next/headers';` line in each file unless something else in that file also calls `cookies()` directly — check each file before deleting the import.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these 4 files.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, visit `/logbook` (which calls `/api/logbook/today`, `/weekly`, `/calendar`, `/correlation`). Confirm all four log 200 in the terminal with no `cookies()` warning.

- [ ] **Step 4: Commit**

```bash
git add app/api/logbook
git commit -m "fix: migrate logbook API routes to @supabase/ssr"
```

---

### Task 5: Migrate `app/api/myday/*` and `app/api/social/username-available`

**Files:**
- Modify: `app/api/myday/route.ts`
- Modify: `app/api/myday/calendar/route.ts`
- Modify: `app/api/myday/[id]/route.ts`
- Modify: `app/api/social/username-available/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to each file: swap the `createRouteHandlerClient({ cookies })` import/call for `await createClient()` from `@/lib/supabase/server`, dropping the now-unused `cookies` import from `next/headers` where nothing else in the file needs it. `app/api/myday/route.ts` and `app/api/myday/[id]/route.ts` each have 2 occurrences (one per exported HTTP method) — migrate both in each file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these 4 files.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, hit `/api/myday`, `/api/myday/calendar`, and the signup username-check flow (which calls `/api/social/username-available`). Confirm 200s, no `cookies()` warning.

- [ ] **Step 4: Commit**

```bash
git add app/api/myday "app/api/social/username-available/route.ts"
git commit -m "fix: migrate myday and social API routes to @supabase/ssr"
```

---

### Task 6: Migrate `app/api/notifications/*`

**Files:**
- Modify: `app/api/notifications/subscribe/route.ts`
- Modify: `app/api/notifications/send/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to both files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, trigger a push-notification subscribe from `/profile` (or the dashboard's `PushNotificationPrompt`). Confirm no `cookies()` warning.

- [ ] **Step 4: Commit**

```bash
git add app/api/notifications
git commit -m "fix: migrate notifications API routes to @supabase/ssr"
```

---

### Task 7: Migrate `app/api/ai/*` route handlers

**Files:**
- Modify: `app/api/ai/workout-plan/route.ts`
- Modify: `app/api/ai/estimate-workout-calories/route.ts`
- Modify: `app/api/ai/estimate-food-calories/route.ts`
- Modify: `app/api/ai/scan-receipt/route.ts`
- Modify: `app/api/ai/scan-food/route.ts`
- Modify: `app/api/ai/program/route.ts`
- Modify: `app/api/ai/categorize-task/route.ts`
- Modify: `app/api/ai/meal-plan/route.ts`
- Modify: `app/api/ai/meal-plan/candidates/route.ts`
- Modify: `app/api/ai/meal-plan/finalize/route.ts`
- Modify: `app/api/ai/homelog/suggest-chores/route.ts`
- Modify: `app/api/ai/tasklog/parse-quick-add/route.ts`
- Modify: `app/api/ai/tasklog/breakdown/route.ts`
- Modify: `app/api/ai/tasklog/idea-breakdown/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to all 14 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, exercise one AI flow per sub-app that's quick to trigger (e.g. BurnLog "scan food", TaskLog "quick add" parse, MoneyLog meal-plan finalize, HomeLog suggest-chores). Confirm no `cookies()` warnings and requests still return valid JSON.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai
git commit -m "fix: migrate AI API routes to @supabase/ssr"
```

---

### Task 8: Migrate `app/api/shoppinglog/*` route handlers

**Files:**
- Modify: `app/api/shoppinglog/favorites/route.ts`
- Modify: `app/api/shoppinglog/favorites/[id]/route.ts`
- Modify: `app/api/shoppinglog/listings/route.ts`
- Modify: `app/api/shoppinglog/listings/[id]/route.ts`
- Modify: `app/api/shoppinglog/listings/[id]/reviews/route.ts`
- Modify: `app/api/shoppinglog/checkout/route.ts`
- Modify: `app/api/shoppinglog/cart/route.ts`
- Modify: `app/api/shoppinglog/cart/[id]/route.ts`
- Modify: `app/api/shoppinglog/orders/route.ts`
- Modify: `app/api/shoppinglog/categories/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to all 10 files. `favorites/route.ts`, `listings/route.ts`, and `cart/route.ts` each have 2 occurrences — migrate both per file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, browse `/shoppinglog` listings, add one to cart, check favorites. Confirm no `cookies()` warnings.

- [ ] **Step 4: Commit**

```bash
git add app/api/shoppinglog
git commit -m "fix: migrate shoppinglog API routes to @supabase/ssr"
```

---

### Task 9: Migrate `app/api/sociallog/*` route handlers

**Files:**
- Modify: `app/api/sociallog/messages/threads/route.ts`
- Modify: `app/api/sociallog/messages/threads/[id]/messages/route.ts`
- Modify: `app/api/sociallog/posts/route.ts`
- Modify: `app/api/sociallog/posts/[id]/vote/route.ts`
- Modify: `app/api/sociallog/posts/[id]/comments/route.ts`
- Modify: `app/api/sociallog/activity/route.ts`
- Modify: `app/api/sociallog/follow/route.ts`
- Modify: `app/api/sociallog/follow/[id]/route.ts`
- Modify: `app/api/sociallog/search/reels/route.ts`
- Modify: `app/api/sociallog/search/users/route.ts`
- Modify: `app/api/sociallog/search/topics/route.ts`
- Modify: `app/api/sociallog/profile-settings/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to all 12 files. `messages/threads/route.ts`, `posts/route.ts`, and `profile-settings/route.ts` each have 2 occurrences — migrate both per file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/sociallog`, view posts feed, open a message thread. Confirm no `cookies()` warnings.

- [ ] **Step 4: Commit**

```bash
git add app/api/sociallog
git commit -m "fix: migrate sociallog API routes to @supabase/ssr"
```

---

### Task 10: Migrate `app/api/homelog/*` route handlers

**Files:**
- Modify: `app/api/homelog/chores/route.ts`
- Modify: `app/api/homelog/chores/[id]/route.ts`
- Modify: `app/api/homelog/chores/instances/[id]/complete/route.ts`
- Modify: `app/api/homelog/settlements/route.ts`
- Modify: `app/api/homelog/expenses/route.ts`
- Modify: `app/api/homelog/expenses/[id]/route.ts`
- Modify: `app/api/homelog/shopping-list/route.ts`
- Modify: `app/api/homelog/shopping-list/[id]/route.ts`
- Modify: `app/api/homelog/shopping-list/[id]/check/route.ts`
- Modify: `app/api/homelog/inventory/route.ts`
- Modify: `app/api/homelog/inventory/[id]/route.ts`
- Modify: `app/api/homelog/inventory/[id]/adjust/route.ts`
- Modify: `app/api/homelog/households/route.ts`
- Modify: `app/api/homelog/households/me/route.ts`
- Modify: `app/api/homelog/households/[id]/members/[profileId]/route.ts`
- Modify: `app/api/homelog/households/[id]/leave/route.ts`
- Modify: `app/api/homelog/invites/route.ts`
- Modify: `app/api/homelog/invites/[id]/decline/route.ts`
- Modify: `app/api/homelog/invites/[id]/accept/route.ts`
- Modify: `app/api/homelog/balances/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) from `@/lib/supabase/server` (Task 1).

- [ ] **Step 1: Apply the same transformation as Task 4** to all 20 files. `chores/route.ts`, `expenses/route.ts`, `shopping-list/route.ts`, `inventory/route.ts`, `households/route.ts`, and `invites/route.ts` each have 2 occurrences — migrate both per file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/homelog`, check chores list, expenses, inventory. Confirm no `cookies()` warnings.

- [ ] **Step 4: Commit**

```bash
git add app/api/homelog
git commit -m "fix: migrate homelog API routes to @supabase/ssr"
```

---

### Task 11: Migrate shared client components (`lib/`, `components/`)

**Files:**
- Modify: `lib/useFinanceData.ts`
- Modify: `lib/useCurrentProfile.ts`
- Modify: `components/kokonutui/water-intake-tracker.tsx`
- Modify: `components/TopBar.tsx`
- Modify: `components/ProfileMenu.tsx`
- Modify: `components/CrossAppSnapshot.tsx`
- Modify: `components/ConfigMenu.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1).

- [ ] **Step 1: Apply the transformation to each file**

Before:
```ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
...
const supabase = createClientComponentClient();
```

After:
```ts
import { createClient } from '@/lib/supabase/client';
...
const supabase = createClient();
```

No `await` needed — the browser client is created synchronously.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these 7 files.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, load the dashboard TopBar/ProfileMenu/ConfigMenu (any page renders these), open MoneyLog to exercise `useFinanceData`, open a profile-linked widget for `useCurrentProfile`, and the BurnLog dashboard's water-intake tracker. Confirm no console errors and data loads.

- [ ] **Step 4: Commit**

```bash
git add lib/useFinanceData.ts lib/useCurrentProfile.ts components/kokonutui/water-intake-tracker.tsx components/TopBar.tsx components/ProfileMenu.tsx components/CrossAppSnapshot.tsx components/ConfigMenu.tsx
git commit -m "fix: migrate shared components to @supabase/ssr browser client"
```

---

### Task 12: Migrate root auth/profile/onboarding-entry pages

**Files:**
- Modify: `app/signup/page.tsx`
- Modify: `app/signup/profile/page.tsx` (also fix the `Session` type import — see Step 2)
- Modify: `app/profile/page.tsx`
- Modify: `app/profile/_components/ProfileAvatar.tsx`
- Modify: `app/profile/_components/OnboardingPageTogglesModal.tsx`
- Modify: `app/profile/_components/AiModelSettingsModal.tsx`
- Modify: `app/onboarding/apps/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/ai-setup/_components/AiSetupFlow.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 9 of these files use the client-component pattern (`createClientComponentClient()`).

- [ ] **Step 1: Apply the same transformation as Task 11** to all 9 files.

- [ ] **Step 2: Fix the `Session` type import in `app/signup/profile/page.tsx`**

Before:
```ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Session } from '@supabase/auth-helpers-nextjs';
```

After:
```ts
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
```

`Session` is defined in `@supabase/supabase-js` and was only re-exported by `auth-helpers-nextjs`; `@supabase/supabase-js` is already a direct dependency so no install is needed.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these 9 files, including the `Session` type resolving correctly.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`, walk through `/login`, `/signup`, `/signup/profile`, `/profile`, `/onboarding/apps`, and `/ai-setup`. Confirm each loads and no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/signup app/profile app/onboarding/apps "app/login/page.tsx" app/ai-setup
git commit -m "fix: migrate auth/profile/onboarding pages to @supabase/ssr"
```

---

### Task 13: Migrate `app/(tasklog)/*`

**Files:**
- Modify: `app/(tasklog)/tasklog/page.tsx`
- Modify: `app/(tasklog)/tasklog/board/page.tsx`
- Modify: `app/(tasklog)/tasklog/plan/page.tsx`
- Modify: `app/(tasklog)/tasklog/plan/_components/AddIdeaForm.tsx`
- Modify: `app/(tasklog)/tasklog/goals/page.tsx`
- Modify: `app/(tasklog)/tasklog/goals/_components/GoalCard.tsx`
- Modify: `app/(tasklog)/tasklog/goals/_components/AddGoalForm.tsx`
- Modify: `app/(tasklog)/tasklog/onboarding/_components/TaskLogOnboardingFlow.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 8 files use the client-component pattern.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 8 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/tasklog`, `/tasklog/board`, `/tasklog/plan`, `/tasklog/goals`, and run through the TaskLog onboarding flow once. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(tasklog)"
git commit -m "fix: migrate tasklog pages to @supabase/ssr browser client"
```

---

### Task 14: Migrate `app/(sociallog)/*` and `app/(shoppinglog)/*`

**Files:**
- Modify: `app/(sociallog)/sociallog/messages/[threadId]/page.tsx`
- Modify: `app/(sociallog)/sociallog/_components/ComposeBox.tsx`
- Modify: `app/(shoppinglog)/shoppinglog/_components/ListingForm.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 3 files use the client-component pattern.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 3 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open a `/sociallog` message thread, compose a post, and open the ShoppingLog "new listing" form. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(sociallog)" "app/(shoppinglog)"
git commit -m "fix: migrate sociallog/shoppinglog pages to @supabase/ssr browser client"
```

---

### Task 15: Migrate `app/(moneylog)/*` client pages

**Files:**
- Modify: `app/(moneylog)/moneylog/page.tsx`
- Modify: `app/(moneylog)/moneylog/plan/page.tsx`
- Modify: `app/(moneylog)/moneylog/goals/page.tsx`
- Modify: `app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx`
- Modify: `app/(moneylog)/moneylog/goals/_components/AddFinancialGoalForm.tsx`
- Modify: `app/(moneylog)/moneylog/onboarding/_components/MoneyLogOnboardingFlow.tsx`
- Modify: `app/(moneylog)/moneylog/_components/LogTransactionModal.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). Note `app/(moneylog)/moneylog/insights/page.tsx` is NOT in this list — it's the server-component page already migrated in Task 3.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 7 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/moneylog`, `/moneylog/plan`, `/moneylog/goals`, log a transaction, and run through the MoneyLog onboarding flow once. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(moneylog)"
git commit -m "fix: migrate moneylog pages to @supabase/ssr browser client"
```

---

### Task 16: Migrate `app/(logbook)/*` and `app/(burnlog)/session/*`

**Files:**
- Modify: `app/(logbook)/logbook/_components/QuickAddFab.tsx`
- Modify: `app/(burnlog)/session/page.tsx`
- Modify: `app/(burnlog)/session/_components/WorkoutHistory.tsx`
- Modify: `app/(burnlog)/session/_components/ProgramWeekAccordion.tsx`
- Modify: `app/(burnlog)/session/_components/ProgramView.tsx`
- Modify: `app/(burnlog)/session/_components/ProgramCreateFlow.tsx`
- Modify: `app/(burnlog)/session/_components/PlanMonthCalendar.tsx`
- Modify: `app/(burnlog)/session/_components/PlanMonthActivitySummary.tsx`
- Modify: `app/(burnlog)/session/_components/MealChecklist.tsx`
- Modify: `app/(burnlog)/session/_components/CompletionTracker.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 10 files use the client-component pattern.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 10 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/logbook` and use the Quick Add FAB, then open `/session` and check workout history, program view, and meal checklist. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(logbook)" "app/(burnlog)/session"
git commit -m "fix: migrate logbook/session pages to @supabase/ssr browser client"
```

---

### Task 17: Migrate `app/(burnlog)/meal-planner/*` and `app/(burnlog)/goals/*`

**Files:**
- Modify: `app/(burnlog)/meal-planner/grocery-list/page.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/ShoppingDayStep.tsx`
- Modify: `app/(burnlog)/meal-planner/_components/MealPlannerFlow.tsx`
- Modify: `app/(burnlog)/goals/page.tsx`
- Modify: `app/(burnlog)/goals/_components/WeightTracker.tsx`
- Modify: `app/(burnlog)/goals/_components/StaminaTracker.tsx`
- Modify: `app/(burnlog)/goals/_components/FoodIntakeTracker.tsx`
- Modify: `app/(burnlog)/goals/_components/CalorieTracker.tsx`
- Modify: `app/(burnlog)/goals/_components/AddGoalForm.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 9 files use the client-component pattern. Note `app/(burnlog)/insights/page.tsx` is NOT in this list — it's the server-component page already migrated in Task 3.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 9 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/goals` and check each tracker widget, run the meal-planner flow through to the grocery list. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/meal-planner" "app/(burnlog)/goals"
git commit -m "fix: migrate burnlog meal-planner/goals pages to @supabase/ssr browser client"
```

---

### Task 18: Migrate `app/(burnlog)/dashboard/*`

**Files:**
- Modify: `app/(burnlog)/dashboard/page.tsx`
- Modify: `app/(burnlog)/dashboard/config/page.tsx`
- Modify: `app/(burnlog)/dashboard/_components/quick-log/WalkTrackerModal.tsx`
- Modify: `app/(burnlog)/dashboard/_components/quick-log/LogWorkoutModal.tsx`
- Modify: `app/(burnlog)/dashboard/_components/quick-log/LogStepsModal.tsx`
- Modify: `app/(burnlog)/dashboard/_components/quick-log/LogCaloriesModal.tsx`
- Modify: `app/(burnlog)/dashboard/_components/PushNotificationPrompt.tsx`
- Modify: `app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx`
- Modify: `app/(burnlog)/dashboard/_components/ConsistencyTracker.tsx`

**Interfaces:**
- Consumes: `createClient()` (sync) from `@/lib/supabase/client` (Task 1). All 9 files use the client-component pattern.

- [ ] **Step 1: Apply the same transformation as Task 11** to all 9 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test**

Run: `npm run dev`, open `/dashboard`, log a walk/workout/steps/calories entry, open `/dashboard/config`. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(burnlog)/dashboard"
git commit -m "fix: migrate burnlog dashboard pages to @supabase/ssr browser client"
```

---

### Task 19: Remove the old package and do a full verification pass

**Files:**
- Modify: `package.json` (remove `@supabase/auth-helpers-nextjs`, `@supabase/auth-helpers-react`)

**Interfaces:**
- Consumes: nothing new — this is the final sweep confirming Tasks 1–18 left no stragglers.

- [ ] **Step 1: Confirm zero remaining references**

```bash
grep -rl "@supabase/auth-helpers" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .claude/worktrees
```

Expected: no output. If anything prints, go back and migrate that file using the matching pattern from Task 3 (server) or Task 11 (client) before continuing.

- [ ] **Step 2: Remove the packages**

```bash
npm uninstall @supabase/auth-helpers-nextjs @supabase/auth-helpers-react
```

- [ ] **Step 3: Full typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors.

- [ ] **Step 4: Full dev-server smoke pass**

Run: `npm run dev`, click through each sub-app's main page once (`/`, `/dashboard`, `/logbook`, `/tasklog`, `/moneylog`, `/homelog`, `/shoppinglog`, `/sociallog`) and confirm the terminal shows zero `cookies()` sync-dynamic-API errors across the whole pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove deprecated @supabase/auth-helpers packages"
```
