# AdminLog Test Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin run the real, unmodified onboarding wizards against a dedicated, resettable test identity — never touching their own profile — and see a raw-data / human-summary readout of what got written.

**Architecture:** A single persistent test auth account (fixed email, lazily created) gets a `profiles` row with `isTestAccount = true`. "Enter Test Mode" swaps the browser's Supabase session to that account via a server-generated magic-link token (admin-checked before the swap); the admin then walks the real `/signup/profile` → `/onboarding/apps` → per-app wizards exactly like a new user. A site-wide banner lets them exit back to their own stashed session. An AdminLog results page reads the test profile's rows (raw dump + human summary tabs) and can reset it (delete guarded by `isTestAccount = true`) for the next run.

**Tech Stack:** Next.js App Router, Prisma/Postgres, Supabase Auth (admin API: `createUser`, `generateLink`) + `@supabase/ssr` session (`verifyOtp`, `setSession`), shadcn `Tabs`, `sessionStorage` for the session stash.

**Spec:** `docs/superpowers/specs/2026-09-02-adminlog-test-onboarding-design.md`

## Global Constraints

- Every destructive operation on the test profile hard-checks `profiles.isTestAccount = true` before touching any row — never trust an id alone.
- Every new API route verifies the **caller's own current session** is an admin, server-side, before doing anything — never trust a client-side flag.
- Zero changes to the 5 existing onboarding wizards (BurnLog `ai-setup`, MoneyLog/TaskLog/HomeLog/LearnLog `onboarding`) — they must run completely unmodified.
- `npm run build` must pass after every task.

---

### Task 1: `isTestAccount` field + migration

**Files:**
- Modify: `prisma/schema.prisma` (`model Profile`, add the field near `isAdmin` at line 23)

**Interfaces:**
- Produces: `Profile.isTestAccount: boolean` — used by every task below.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, find `isAdmin       Boolean  @default(false)` inside `model Profile` and add directly after it:

```prisma
  isTestAccount Boolean  @default(false)
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_profile_is_test_account`
Expected: migration created under `prisma/migrations/`, applied with no errors, Prisma Client regenerated.

If the migration engine reports drift or wants to reset the database, **stop and ask the user** before proceeding — do not run `prisma migrate reset` without explicit confirmation (this DB is shared across concurrent worktree sessions; a previous session hit exactly this and had to recover RLS afterward — see `docs/superpowers/specs/2026-09-02-ai-jobs-log-design.md` history for why this matters).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(adminlog): add Profile.isTestAccount field"
```

---

### Task 2: Shared server helpers

**Files:**
- Create: `lib/adminlog/testOnboarding.ts`

**Interfaces:**
- Produces:
  - `TEST_ONBOARDING_EMAIL: string`
  - `TEST_ONBOARDING_TABLES: ReadonlyArray<{ table: string; label: string }>` — ordered child-first for safe deletion, and used to drive both the raw-data fetch and the reset route.
  - `requireAdminCaller(supabase: SupabaseClient): Promise<{ id: string; userId: string } | null>` — resolves the *calling* user's own profile and returns it only if `isAdmin` is true, else `null`. Used by every route below to gate access.
  - `findTestProfile(admin: SupabaseClient): Promise<{ id: string; userId: string } | null>` — looks up the test profile by `isTestAccount = true` (not by email — the email only identifies the `auth.users` row), returns `null` if it doesn't exist yet.

- [ ] **Step 1: Write the helpers**

```ts
// lib/adminlog/testOnboarding.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export const TEST_ONBOARDING_EMAIL =
  process.env.ADMINLOG_TEST_ONBOARDING_EMAIL || 'adminlog.test.onboarding@gmail.com';

// Child-first order: every table a row here references must already be
// gone (or never existed) by the time we reach it. Onboarding wizards only
// ever write these; the profiles row itself is deleted last, separately.
export const TEST_ONBOARDING_TABLES: ReadonlyArray<{ table: string; label: string }> = [
  { table: 'tasklog_tasks', label: 'TaskLog tasks' },
  { table: 'task_goals', label: 'TaskLog goals' },
  { table: 'recurring_items', label: 'MoneyLog recurring items' },
  { table: 'workout_plans', label: 'BurnLog workout plan' },
  { table: 'learnlog_skill_sessions', label: 'LearnLog skill sessions' },
  { table: 'learnlog_skill_milestones', label: 'LearnLog skill milestones' },
  { table: 'learnlog_skills', label: 'LearnLog skills' },
  { table: 'learnlog_career_goals', label: 'LearnLog career goals' },
  { table: 'learnlog_library_items', label: 'LearnLog library items' },
  { table: 'household_chores', label: 'HomeLog chores' },
];

export async function requireAdminCaller(
  supabase: SupabaseClient
): Promise<{ id: string; userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, userId, isAdmin')
    .eq('userId', user.id)
    .single();

  if (!profile?.isAdmin) return null;
  return { id: profile.id, userId: profile.userId };
}

export async function findTestProfile(
  admin: SupabaseClient
): Promise<{ id: string; userId: string } | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, userId')
    .eq('isTestAccount', true)
    .maybeSingle();
  return data ?? null;
}
```

Note: `household_chores` has no `profileId` column (it's owned via `householdId`) — it's included here for the raw-data/summary display step (Task 4 handles it via a household lookup, not a direct `.eq('profileId', ...)` filter like the others). Household deletion itself (if the test account created one) is handled separately in Task 4's reset logic, not through this generic table list.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds (file is unused so far, but must type-check).

- [ ] **Step 3: Commit**

```bash
git add lib/adminlog/testOnboarding.ts
git commit -m "feat(adminlog): add test-onboarding server helpers"
```

---

### Task 3: `POST /api/adminlog/test-onboarding/start`

**Files:**
- Create: `app/api/adminlog/test-onboarding/start/route.ts`

**Interfaces:**
- Consumes: `requireAdminCaller`, `TEST_ONBOARDING_EMAIL` from Task 2; `createClient` from `@/lib/supabase/server`; `createServiceRoleClient` from `@/lib/supabase/serviceRole`.
- Produces: `POST /api/adminlog/test-onboarding/start` → `{ tokenHash: string }` on success — consumed by Task 5 (`TestModeBanner`'s "Enter Test Mode" trigger, actually placed in Task 6's page, see below).

- [ ] **Step 1: Write the route**

```ts
// app/api/adminlog/test-onboarding/start/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller, TEST_ONBOARDING_EMAIL } from '@/lib/adminlog/testOnboarding';

export async function POST() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();

  // Ensure the test auth account exists (idempotent).
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  let testUserId = existingUsers?.users.find((u) => u.email === TEST_ONBOARDING_EMAIL)?.id;

  if (!testUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: TEST_ONBOARDING_EMAIL,
      email_confirm: true,
    });
    if (createError || !created.user) {
      console.error('test-onboarding/start: failed to create test user', createError);
      return NextResponse.json({ error: 'Failed to create test account' }, { status: 500 });
    }
    testUserId = created.user.id;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_ONBOARDING_EMAIL,
  });
  if (linkError || !link) {
    console.error('test-onboarding/start: failed to generate link', linkError);
    return NextResponse.json({ error: 'Failed to start test session' }, { status: 500 });
  }

  return NextResponse.json({ tokenHash: link.properties.hashed_token });
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds. If `link.properties.hashed_token` doesn't type-check against the installed `@supabase/supabase-js` version, run `grep -rn "hashed_token\|GenerateLinkProperties" node_modules/@supabase/auth-js/dist/module/lib/types.d.ts` to find the exact property name and adjust.

- [ ] **Step 3: Manually verify the route responds**

With `npm run dev` running and signed in as an admin (check `profiles.isAdmin = true` for your test session — set it directly via SQL if needed on this dev DB), run:
```bash
curl -X POST http://localhost:3000/api/adminlog/test-onboarding/start -H "Cookie: <your session cookie>"
```
Expected: `{"tokenHash":"<some string>"}`. Confirm via the Supabase dashboard/SQL (`select id, email from auth.users where email = 'adminlog.test.onboarding@gmail.com'`) that the test user now exists.

- [ ] **Step 4: Commit**

```bash
git add app/api/adminlog/test-onboarding/start/route.ts
git commit -m "feat(adminlog): add test-onboarding session start route"
```

---

### Task 4: `GET` + `DELETE /api/adminlog/test-onboarding`

**Files:**
- Create: `app/api/adminlog/test-onboarding/route.ts`

**Interfaces:**
- Consumes: `requireAdminCaller`, `findTestProfile`, `TEST_ONBOARDING_TABLES` from Task 2.
- Produces:
  - `GET /api/adminlog/test-onboarding` → `{ profile: Record<string, unknown> | null; tables: Record<string, unknown[]> }` — `tables` keyed by table name from `TEST_ONBOARDING_TABLES`, each value the array of rows owned by the test profile (empty array if none). Consumed by Task 6's results page.
  - `DELETE /api/adminlog/test-onboarding` → `{ ok: true }` — wipes the test profile and everything it owns. Consumed by Task 6's "Reset" button.

- [ ] **Step 1: Write the route**

```ts
// app/api/adminlog/test-onboarding/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller, findTestProfile, TEST_ONBOARDING_TABLES } from '@/lib/adminlog/testOnboarding';

export async function GET() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const testProfile = await findTestProfile(admin);
  if (!testProfile) {
    return NextResponse.json({ profile: null, tables: {} });
  }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', testProfile.id)
    .single();

  const tables: Record<string, unknown[]> = {};
  for (const { table } of TEST_ONBOARDING_TABLES) {
    if (table === 'household_chores') continue; // owned via householdId, handled separately below
    const { data } = await admin.from(table).select('*').eq('profileId', testProfile.id);
    tables[table] = data ?? [];
  }

  const { data: membership } = await admin
    .from('household_members')
    .select('householdId')
    .eq('profileId', testProfile.id)
    .maybeSingle();

  if (membership) {
    const { data: chores } = await admin
      .from('household_chores')
      .select('*')
      .eq('householdId', membership.householdId);
    tables.household_chores = chores ?? [];
  } else {
    tables.household_chores = [];
  }

  return NextResponse.json({ profile: profileRow ?? null, tables });
}

export async function DELETE() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const testProfile = await findTestProfile(admin);
  if (!testProfile) {
    return NextResponse.json({ ok: true }); // nothing to reset
  }

  // Re-confirm the guard directly against the row we're about to delete —
  // never rely solely on findTestProfile's own filter.
  const { data: guard } = await admin
    .from('profiles')
    .select('id, isTestAccount')
    .eq('id', testProfile.id)
    .single();
  if (!guard?.isTestAccount) {
    return NextResponse.json({ error: 'Refusing to reset a non-test profile' }, { status: 400 });
  }

  for (const { table } of TEST_ONBOARDING_TABLES) {
    if (table === 'household_chores') continue;
    await admin.from(table).delete().eq('profileId', testProfile.id);
  }

  const { data: membership } = await admin
    .from('household_members')
    .select('householdId')
    .eq('profileId', testProfile.id)
    .maybeSingle();

  if (membership) {
    const { count: otherMembers } = await admin
      .from('household_members')
      .select('id', { count: 'exact', head: true })
      .eq('householdId', membership.householdId)
      .neq('profileId', testProfile.id);

    await admin.from('household_chores').delete().eq('householdId', membership.householdId);
    await admin.from('household_members').delete().eq('profileId', testProfile.id);

    // Only remove the household itself if the test account was its sole
    // member — never delete a household a real user might also belong to.
    if (!otherMembers) {
      await admin.from('households').delete().eq('id', membership.householdId);
    }
  }

  const { error: deleteError } = await admin.from('profiles').delete().eq('id', testProfile.id);
  if (deleteError) {
    console.error('test-onboarding DELETE: failed to delete profile', deleteError);
    return NextResponse.json({ error: 'Failed to reset test profile' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/adminlog/test-onboarding/route.ts
git commit -m "feat(adminlog): add test-onboarding data + reset routes"
```

---

### Task 5: `TestModeBanner` component

**Files:**
- Create: `components/adminlog/TestModeBanner.tsx`
- Modify: `app/RootLayoutClient.tsx` (mount it alongside `<OfflineBanner />`)

**Interfaces:**
- Produces: `TEST_MODE_ACTIVE_KEY`, `STASHED_SESSION_KEY` (exported `sessionStorage` key constants) — consumed by Task 6's "Enter Test Mode" button, which writes them before redirecting.
- Consumes: `createClient` from `@/lib/supabase/client`.

- [ ] **Step 1: Write the component**

Model its markup on `components/OfflineBanner.tsx` (read that file first for the exact fixed-banner/safe-area pattern) — same fixed-top, `z-[100]`, safe-area-aware structure, but with an amber/warning treatment and an inline "Exit Test Mode" button instead of static text-only.

```tsx
// components/adminlog/TestModeBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export const TEST_MODE_ACTIVE_KEY = 'adminlog:testModeActive';
export const STASHED_SESSION_KEY = 'adminlog:stashedSession';

export function TestModeBanner() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setActive(sessionStorage.getItem(TEST_MODE_ACTIVE_KEY) === '1');
  }, []);

  async function handleExit() {
    setExiting(true);
    try {
      const stashed = sessionStorage.getItem(STASHED_SESSION_KEY);
      if (stashed) {
        const { access_token, refresh_token } = JSON.parse(stashed);
        const supabase = createClient();
        await supabase.auth.setSession({ access_token, refresh_token });
      }
      sessionStorage.removeItem(TEST_MODE_ACTIVE_KEY);
      sessionStorage.removeItem(STASHED_SESSION_KEY);
      setActive(false);
      router.push('/adminlog/test-onboarding');
      router.refresh();
    } finally {
      setExiting(false);
    }
  }

  if (!active) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black"
      style={{ paddingTop: 'env(safe-area-inset-top, 0.5rem)' }}
    >
      <FlaskConical className="w-4 h-4" aria-hidden="true" />
      TEST MODE — running as the onboarding test account
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="ml-2 rounded-md bg-black/10 px-2 py-0.5 font-semibold hover:bg-black/20 disabled:opacity-50"
      >
        Exit Test Mode
      </button>
    </div>
  );
}

export default TestModeBanner;
```

- [ ] **Step 2: Mount it**

In `app/RootLayoutClient.tsx`: add `import { TestModeBanner } from "@/components/adminlog/TestModeBanner";` alongside the other component imports, and add `<TestModeBanner />` immediately after `<OfflineBanner />` in the JSX.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/adminlog/TestModeBanner.tsx app/RootLayoutClient.tsx
git commit -m "feat(adminlog): add test mode banner"
```

---

### Task 6: Results/entry page + AdminLog dashboard link

**Files:**
- Create: `app/(adminlog)/adminlog/test-onboarding/page.tsx`
- Modify: `app/(adminlog)/adminlog/page.tsx` (add a `SECTIONS` entry)

**Interfaces:**
- Consumes: `useRequireAdmin` from `@/lib/adminlog/useRequireAdmin`; `TEST_MODE_ACTIVE_KEY`, `STASHED_SESSION_KEY` from Task 5; `TEST_ONBOARDING_TABLES` from Task 2; `POST /api/adminlog/test-onboarding/start` (Task 3); `GET`/`DELETE /api/adminlog/test-onboarding` (Task 4); `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`; `createClient` from `@/lib/supabase/client`.

- [ ] **Step 1: Write the page**

```tsx
// app/(adminlog)/adminlog/test-onboarding/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { TEST_MODE_ACTIVE_KEY, STASHED_SESSION_KEY } from '@/components/adminlog/TestModeBanner';
import { TEST_ONBOARDING_TABLES } from '@/lib/adminlog/testOnboarding';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

type TestOnboardingData = {
  profile: Record<string, unknown> | null;
  tables: Record<string, unknown[]>;
};

const TABLE_LABELS: Record<string, string> = Object.fromEntries(
  TEST_ONBOARDING_TABLES.map(({ table, label }) => [table, label])
);

async function fetchTestOnboarding(): Promise<TestOnboardingData> {
  const res = await fetch('/api/adminlog/test-onboarding');
  if (!res.ok) throw new Error('Failed to load test onboarding data');
  return res.json();
}

function buildSummary(data: TestOnboardingData): string[] {
  const lines: string[] = [];
  const p = data.profile;
  if (p) {
    lines.push(`Profile: ${p.firstName ?? '?'} ${p.lastName ?? '?'}, apps enabled: ${(p.enabledApps as string[] | undefined)?.join(', ') || 'none'}.`);
    if (p.aiEnabled) lines.push('BurnLog: AI enabled.');
  }
  if (data.tables.workout_plans?.length) lines.push(`BurnLog: ${data.tables.workout_plans.length}-day workout plan generated.`);
  if (data.tables.recurring_items?.length) lines.push(`MoneyLog: ${data.tables.recurring_items.length} recurring items.`);
  if (data.tables.task_goals?.length) lines.push(`TaskLog: ${data.tables.task_goals.length} goal(s), ${data.tables.tasklog_tasks?.length ?? 0} task(s).`);
  if (data.tables.household_chores?.length) lines.push(`HomeLog: ${data.tables.household_chores.length} chore(s).`);
  if (data.tables.learnlog_skills?.length || data.tables.learnlog_career_goals?.length || data.tables.learnlog_library_items?.length) {
    lines.push(`LearnLog: ${data.tables.learnlog_skills?.length ?? 0} skill(s), ${data.tables.learnlog_career_goals?.length ?? 0} career goal(s), ${data.tables.learnlog_library_items?.length ?? 0} library item(s).`);
  }
  return lines;
}

export default function TestOnboardingPage() {
  const { profile, loading } = useRequireAdmin();
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR('adminlog-test-onboarding', fetchTestOnboarding);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleEnterTestMode() {
    setStarting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No current session');

      const res = await fetch('/api/adminlog/test-onboarding/start', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start test session');
      const { tokenHash } = await res.json();

      sessionStorage.setItem(
        STASHED_SESSION_KEY,
        JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
      );

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (verifyError) throw verifyError;

      sessionStorage.setItem(TEST_MODE_ACTIVE_KEY, '1');
      router.push('/signup/profile');
    } catch (err) {
      console.error('Enter Test Mode failed:', err);
      setStarting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch('/api/adminlog/test-onboarding', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset test profile');
      await mutate();
    } finally {
      setResetting(false);
    }
  }

  if (loading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  const hasTestProfile = !!data?.profile;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Test Onboarding</h1>
      <p className="text-sm text-muted-foreground">
        Run the real onboarding flow as a dedicated test account — your own profile is never touched.
      </p>

      <div className="flex gap-2">
        <Button onClick={handleEnterTestMode} disabled={starting}>
          {starting ? 'Starting…' : 'Enter Test Mode'}
        </Button>
        {hasTestProfile && (
          <Button variant="destructive" onClick={handleReset} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset test profile'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="animate-spin h-5 w-5" />
      ) : !hasTestProfile ? (
        <p className="text-sm text-muted-foreground">No test profile yet — click "Enter Test Mode" to start one.</p>
      ) : (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="raw">Raw data</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="space-y-2 pt-2">
            {buildSummary(data).map((line, i) => (
              <p key={i} className="text-sm">{line}</p>
            ))}
          </TabsContent>
          <TabsContent value="raw" className="space-y-3 pt-2">
            {Object.entries(data.tables)
              .filter(([, rows]) => rows.length > 0)
              .map(([table, rows]) => (
                <Card key={table}>
                  <CardHeader>
                    <CardTitle className="text-sm">{TABLE_LABELS[table] ?? table}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-2 text-xs">
                      {JSON.stringify(rows, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Check the `Button` component's prop API**

Run: `grep -n "variant" components/ui/button.tsx | head -10` to confirm `variant="destructive"` is a valid variant on this project's `Button` — adjust to whatever the actual variant name is if different.

- [ ] **Step 3: Add the dashboard link**

In `app/(adminlog)/adminlog/page.tsx`, add to the `SECTIONS` array (after the existing 4 entries):

```ts
{ href: '/adminlog/test-onboarding', label: 'Test Onboarding', description: 'Run the real onboarding flow as a disposable test account.' },
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add "app/(adminlog)/adminlog/test-onboarding/page.tsx" "app/(adminlog)/adminlog/page.tsx"
git commit -m "feat(adminlog): add test onboarding results page"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Make yourself an admin on the dev DB**

If your dev profile isn't already `isAdmin = true`, set it directly: `update profiles set "isAdmin" = true where "userId" = '<your auth uid>';`

- [ ] **Step 2: Full walkthrough**

With `npm run dev` running: go to `/adminlog/test-onboarding`, click "Enter Test Mode". Confirm you land on `/signup/profile` and the amber TEST MODE banner is visible site-wide. Complete the profile form, pick BurnLog + TaskLog on `/onboarding/apps`, complete both wizards. Click "Exit Test Mode" in the banner.

- [ ] **Step 3: Confirm isolation**

Confirm you're back to your own account/profile (check `/profile` shows your real name, not the test account's) and that none of your own data changed.

- [ ] **Step 4: Confirm the results page**

On `/adminlog/test-onboarding`, confirm the Summary tab shows lines for BurnLog and TaskLog, and the Raw data tab shows the actual `workout_plans`/`task_goals`/`tasklog_tasks` rows.

- [ ] **Step 5: Confirm reset**

Click "Reset test profile". Confirm the page returns to the "No test profile yet" state, and directly query the DB to confirm the `profiles` row (and its owned rows) are gone: `select count(*) from profiles where "isTestAccount" = true;` → expect `0`.

- [ ] **Step 6: Confirm the admin gate**

Log in as a non-admin profile (or temporarily flip your own `isAdmin` to `false`) and confirm `/adminlog/test-onboarding` redirects away, and `curl -X POST http://localhost:3000/api/adminlog/test-onboarding/start` (with that non-admin session's cookie) returns 403.

- [ ] **Step 7: Full build + lint**

Run: `npm run build && npm run lint`
Expected: both succeed with no new warnings.
