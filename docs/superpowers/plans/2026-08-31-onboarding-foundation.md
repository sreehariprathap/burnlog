# Onboarding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users pick which sub-apps they want from a Logbook-driven app-selection screen; selected apps with existing onboarding (BurnLog, MoneyLog) are sequenced through automatically; a persisted `enabledApps` list filters what `AppSwitcher` shows and lets existing users add more apps later.

**Architecture:** A stateless URL-driven orchestrator (`/onboarding/sequence`) chains through each selected app's existing (or, for four apps, not-yet-built) onboarding route via `returnTo` params — no new "onboarding progress" table. `enabledApps` is a new `Profile` column, cached client-side in `localStorage` (same pattern as the existing `defaultApp`/`activeApp` cache in `lib/appMode.ts`) so `AppSwitcher` can filter synchronously without a fetch on every open.

**Tech Stack:** Next.js App Router (client components), Supabase JS client, Prisma (schema + `db push`, no migration files in this repo), shadcn/ui, lucide-react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-31-onboarding-foundation-design.md`

## Global Constraints

- `age`/`weight`/`height`/`activityLevel` on `Profile` stay `NOT NULL`, collected at `/signup/profile` for every user regardless of app selection — no migration for those columns.
- No new "onboarding progress" DB field — the orchestrator's state lives entirely in URL query params (`apps`, `step`, `returnTo`).
- BurnLog's `/ai-setup` and MoneyLog's `/moneylog/onboarding` question/goal-creation content is unchanged — only `returnTo` wiring changes.
- `enabledApps` defaults to `[]` in the schema; the one-time backfill sets existing rows to all 6 sub-app ids so existing users see no behavior change.
- This repo has no `prisma/migrations` or `supabase/migrations` directory — schema changes are applied directly against the DB in `.env`'s `DATABASE_URL` via `npx prisma db push`. `.env` is gitignored and must be copied into any worktree before running Prisma commands (already done for this worktree).

---

### Task 1: `enabledApps` schema + backfill

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `profiles.enabledApps` — a Postgres `text[]` column, `NOT NULL DEFAULT '{}'`, readable/writable through the existing untyped Supabase client (`.select('enabledApps')` / `.update({ enabledApps: [...] })`) exactly like every other column already used in this codebase — no generated Supabase types exist to regenerate.

- [ ] **Step 1: Add the field to the Prisma schema**

In `prisma/schema.prisma`, on the `Profile` model, add this line directly after `mealPrepTimezone`:

```prisma
  mealPrepTimezone         String?
  enabledApps              String[] @default([])
  lastMealPlanGeneratedAt  DateTime?
```

(Matches the file's existing alignment style for this block of columns.)

- [ ] **Step 2: Push the schema to the real dev database**

Run: `npx prisma db push`
Expected: reports the new column added to `profiles`, no data loss warnings (it's a new nullable-by-default-value column).

- [ ] **Step 3: Backfill existing rows**

Run this against the same database (e.g. via `npx prisma db execute --stdin` piping the SQL below, or the Supabase SQL editor if that's how this project's owner normally runs one-off statements — either is fine, the statement is idempotent):

```sql
UPDATE profiles
SET "enabledApps" = ARRAY['moneylog','tasklog','homelog','sociallog','shoppinglog','burnlog']
WHERE "enabledApps" = '{}';
```

Verify: `npx prisma db execute --stdin <<< "SELECT count(*) FROM profiles WHERE \"enabledApps\" = '{}';"` should return `0` (assuming there was at least one existing profile row before this task — if the table was empty, `0` either way is correct).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add enabledApps column to profiles, backfill existing rows"
```

---

### Task 2: `enabledApps` cache helpers in `lib/appMode.ts`

**Files:**
- Modify: `lib/appMode.ts`

**Interfaces:**
- Produces:
  - `export function isAppId(val: string | null): val is AppId` (was private, now exported — needed by Task 5's app-selection screen and Task 6's orchestrator to validate untrusted URL/query values)
  - `export const ENABLED_APPS_KEY = 'app:enabledApps'`
  - `export function getEnabledApps(): AppId[] | null` — `null` means "cache not warm yet / never set", distinct from `[]` (a real but unlikely "nothing enabled")
  - `export function setEnabledApps(apps: AppId[]): void`

- [ ] **Step 1: Export `isAppId` and add the new exports**

Change:

```ts
function isAppId(val: string | null): val is AppId {
```

to:

```ts
export function isAppId(val: string | null): val is AppId {
```

Then, after the existing `setActiveApp` function, add:

```ts
export const ENABLED_APPS_KEY = 'app:enabledApps';

export function getEnabledApps(): AppId[] | null {
  const val = safeGet(ENABLED_APPS_KEY);
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter((v): v is AppId => isAppId(v)) : null;
  } catch {
    return null;
  }
}

export function setEnabledApps(apps: AppId[]): void {
  safeSet(ENABLED_APPS_KEY, JSON.stringify(apps));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/appMode.ts
git commit -m "feat: add enabledApps cache helpers to lib/appMode"
```

---

### Task 3: `TopBar` fetches and caches `enabledApps`

**Files:**
- Modify: `components/TopBar.tsx`

**Interfaces:**
- Consumes: `setEnabledApps` from `@/lib/appMode` (Task 2).
- Produces: no new exports — this task only makes the existing mount effect also warm the `enabledApps` cache.

- [ ] **Step 1: Add the fetch to `TopBar`'s existing mount effect**

```tsx
import { AppId, getActiveApp, setEnabledApps, isAppId } from '@/lib/appMode';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
```

```tsx
export function TopBar({ title, onClose, actions }: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeApp, setActiveAppState] = useState<AppId>('logbook');

  useEffect(() => {
    setActiveAppState(getActiveApp());
    (async () => {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('enabledApps')
        .eq('userId', session.user.id)
        .single();
      if (data?.enabledApps) {
        setEnabledApps((data.enabledApps as string[]).filter((v): v is AppId => isAppId(v)));
      }
    })();
  }, []);
```

(`createClientComponentClient` is instantiated inside the effect here rather than at module scope, matching the pattern this task needs without touching every other place `TopBar` is used — no other change to the component's props or rendering.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, log in as any existing user, open dev tools → Application → Local Storage, confirm `app:enabledApps` gets set to a JSON array after the first page load with a `TopBar` (e.g. `/logbook`).

- [ ] **Step 4: Commit**

```bash
git add components/TopBar.tsx
git commit -m "feat: fetch and cache enabledApps on TopBar mount"
```

---

### Task 4: `AppSwitcher` filters by `enabledApps`

**Files:**
- Modify: `components/AppSwitcher.tsx`

**Interfaces:**
- Consumes: `getEnabledApps` from `@/lib/appMode` (Task 2).
- Produces: no new exports — `AppSwitcher`'s rendered app list is now filtered.

- [ ] **Step 1: Filter the rendered list**

```tsx
import { APPS, AppId, getActiveApp, getDefaultApp, setDefaultApp, getEnabledApps } from '@/lib/appMode';
```

```tsx
export function AppSwitcher({ open, onOpenChange }: AppSwitcherProps) {
  const { switchTo } = useAppSwitch();
  const [activeApp, setActiveAppState] = useState<AppId>('logbook');
  const [defaultApp, setDefaultAppState] = useState<AppId>('logbook');
  const [visibleApps, setVisibleApps] = useState(Object.values(APPS));
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (!open) return;
    setActiveAppState(getActiveApp());
    setDefaultAppState(getDefaultApp());
    const enabled = getEnabledApps();
    setVisibleApps(
      enabled
        ? Object.values(APPS).filter((app) => app.id === 'logbook' || enabled.includes(app.id))
        : Object.values(APPS)
    );
  }, [open]);
```

Then change the render loop from `Object.values(APPS).map(...)` to `visibleApps.map(...)` (the `index` used for the stagger `delay` in the `motion.button` transition comes from this same `.map`, so no other change needed there).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Manual check**

With `app:enabledApps` set to e.g. `["burnlog","moneylog"]` in Local Storage (set manually via dev tools, or wait for Task 3's fetch to populate it from a test account with a narrowed `enabledApps` column value), open the `AppSwitcher` drawer and confirm only Logbook, BurnLog, and MoneyLog appear. Clear `app:enabledApps` from Local Storage and confirm all 7 apps appear again (fallback path).

- [ ] **Step 4: Commit**

```bash
git add components/AppSwitcher.tsx
git commit -m "feat: filter AppSwitcher by cached enabledApps"
```

---

### Task 5: App-selection screen

**Files:**
- Create: `app/onboarding/apps/page.tsx`

**Interfaces:**
- Consumes: `APPS`, `AppId`, `setEnabledApps` from `@/lib/appMode` (Task 2).
- Produces: `/onboarding/apps` route. On submit, writes `profiles.enabledApps` and navigates to `/onboarding/sequence?apps=<ids>&step=0`.

- [ ] **Step 1: Write the page**

```tsx
// app/onboarding/apps/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { APPS, AppId, setEnabledApps } from '@/lib/appMode';
import { useToast } from '@/components/ui/use-toast';

const SELECTABLE_APPS = Object.values(APPS).filter((app) => app.id !== 'logbook');

export default function OnboardingAppsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<AppId>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: AppId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    setSaving(true);
    const chosen = Array.from(selected);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ enabledApps: chosen })
      .eq('userId', user.id);
    if (error) {
      toast({ title: 'Could not save your app selection', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    setEnabledApps(chosen);
    router.push(`/onboarding/sequence?apps=${chosen.join(',')}&step=0`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">What do you want to track?</h1>
          <p className="text-sm text-muted-foreground">
            Pick the apps you want — Logbook ties them all together. You can always add more later.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SELECTABLE_APPS.map((app) => {
            const isSelected = selected.has(app.id);
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => toggle(app.id)}
                className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                }`}
              >
                {isSelected && <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />}
                <span className="font-medium">{app.name}</span>
                <span className="text-xs text-muted-foreground">{app.tagline}</span>
              </button>
            );
          })}
        </div>
        <Button className="w-full" disabled={selected.size === 0 || saving} onClick={handleContinue}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, navigate directly to `http://localhost:3000/onboarding/apps` (auth-gated by the `profiles` update call, not a redirect guard — a logged-out visit will fail the `handleContinue` Supabase call and redirect to `/login`, which is acceptable for this internal-only route reached via the signup flow). While logged in, select 2 apps, click Continue, confirm the URL becomes `/onboarding/sequence?apps=<the two ids>&step=0`.

- [ ] **Step 4: Commit**

```bash
git add app/onboarding/apps/page.tsx
git commit -m "feat: add app-selection screen at /onboarding/apps"
```

---

### Task 6: Orchestrator

**Files:**
- Create: `app/onboarding/sequence/page.tsx`

**Interfaces:**
- Consumes: `AppId`, `isAppId` from `@/lib/appMode` (Task 2).
- Produces: `/onboarding/sequence` route reading `apps`/`step`/`returnTo` query params, redirecting into `ONBOARDING_ROUTES[apps[step]]` (with a chained `returnTo` back to itself at `step+1`) or skipping straight to `step+1` when the current app has no entry in `ONBOARDING_ROUTES`, or to the outer `returnTo` once `step >= apps.length`.

- [ ] **Step 1: Write the page**

```tsx
// app/onboarding/sequence/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppId, isAppId } from '@/lib/appMode';

const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
  burnlog: '/ai-setup',
  moneylog: '/moneylog/onboarding',
};

export default function OnboardingSequencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const apps = (searchParams.get('apps') ?? '')
      .split(',')
      .filter((v): v is AppId => isAppId(v));
    const step = Number(searchParams.get('step') ?? '0') || 0;
    const returnTo = searchParams.get('returnTo') ?? '/logbook';

    if (step >= apps.length) {
      router.replace(returnTo);
      return;
    }

    const current = apps[step];
    const onboardingRoute = ONBOARDING_ROUTES[current];
    const nextSequenceUrl = `/onboarding/sequence?apps=${apps.join(',')}&step=${step + 1}&returnTo=${encodeURIComponent(returnTo)}`;

    if (onboardingRoute) {
      router.replace(`${onboardingRoute}?returnTo=${encodeURIComponent(nextSequenceUrl)}`);
    } else {
      router.replace(nextSequenceUrl);
    }
  }, [searchParams, router]);

  return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin w-8 h-8" />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/sequence/page.tsx
git commit -m "feat: add onboarding sequence orchestrator at /onboarding/sequence"
```

---

### Task 7: MoneyLog onboarding gains `returnTo`, config page updated

**Files:**
- Modify: `app/(moneylog)/moneylog/onboarding/_components/MoneyLogOnboardingFlow.tsx`
- Modify: `app/(moneylog)/moneylog/config/page.tsx`

**Interfaces:**
- Produces: `MoneyLogOnboardingFlow` now reads `returnTo` from `useSearchParams()` (default `/moneylog`) and uses it in place of both hardcoded `router.replace('/moneylog')` calls.

- [ ] **Step 1: Add `returnTo` support to `MoneyLogOnboardingFlow`**

```tsx
import { useRouter, useSearchParams } from 'next/navigation';
```

```tsx
export function MoneyLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/moneylog';
  const supabase = createClientComponentClient();
```

Then replace both occurrences of `router.replace('/moneylog')` (in `handleSkipAll` and at the end of `handleConfirm`) with `router.replace(returnTo)`.

- [ ] **Step 2: Update MoneyLog's config page `onboardingHref` for parity with BurnLog's**

In `app/(moneylog)/moneylog/config/page.tsx`:

```diff
-      onboardingHref="/moneylog/onboarding"
+      onboardingHref="/moneylog/onboarding?returnTo=/moneylog/config"
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, visit `/moneylog/config`, click "Reonboard into MoneyLog", step through or skip the wizard, confirm it lands back on `/moneylog/config` (not `/moneylog`). Then visit `/moneylog/onboarding` directly (no `returnTo`), complete or skip it, confirm it still lands on `/moneylog` (default preserved).

- [ ] **Step 5: Commit**

```bash
git add "app/(moneylog)/moneylog/onboarding/_components/MoneyLogOnboardingFlow.tsx" "app/(moneylog)/moneylog/config/page.tsx"
git commit -m "feat(moneylog): support returnTo in onboarding flow, wire config Reonboard to it"
```

---

### Task 8: Signup redirect + "Add another app" on `/profile`

**Files:**
- Modify: `app/signup/profile/page.tsx`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `getEnabledApps`, `setEnabledApps` from `@/lib/appMode` (Task 2).
- Produces: signup now lands on `/onboarding/apps` instead of `/ai-setup`; `/profile`'s App card gains an "Add another app" list.

- [ ] **Step 1: Change the signup redirect**

In `app/signup/profile/page.tsx`:

```diff
-        router.push('/ai-setup');
+        router.push('/onboarding/apps');
```

- [ ] **Step 2: Fetch `enabledApps` alongside the rest of the profile in `app/profile/page.tsx`**

Extend the existing `.select(...)` call:

```diff
-          .select('id,firstName,lastName,age,height,weight,activityLevel,isAdmin,avatarUrl,username')
+          .select('id,firstName,lastName,age,height,weight,activityLevel,isAdmin,avatarUrl,username,enabledApps')
```

- [ ] **Step 3: Add the "Add another app" section and its handler**

Add a handler near `handleSetDefaultApp`:

```tsx
  const [addingApp, setAddingApp] = useState<AppId | null>(null);

  async function handleAddApp(app: AppId) {
    if (!profile) return;
    setAddingApp(app);
    const currentEnabled: AppId[] = profile.enabledApps ?? [];
    const nextEnabled = [...currentEnabled, app];
    const { error } = await supabase
      .from('profiles')
      .update({ enabledApps: nextEnabled })
      .eq('id', profile.id);
    if (error) {
      toast({ title: 'Could not add app', description: error.message, variant: 'destructive' });
      setAddingApp(null);
      return;
    }
    setEnabledApps(nextEnabled);
    setProfile((prev: any) => ({ ...prev, enabledApps: nextEnabled }));
    router.push(`/onboarding/sequence?apps=${app}&step=0&returnTo=/profile`);
  }
```

Import `useState`'s already present; import `setEnabledApps` alongside the other `appMode` imports:

```diff
-import { APPS, AppId, getDefaultApp, setDefaultApp } from '@/lib/appMode';
+import { APPS, AppId, getDefaultApp, setDefaultApp, setEnabledApps } from '@/lib/appMode';
```

Then, inside the existing "App" `Card`'s `CardContent`, after the default-app-selector `.map(...)` block, add:

```tsx
                  {(() => {
                    const enabled: AppId[] = profile.enabledApps ?? [];
                    const notEnabled = Object.values(APPS).filter(
                      (app) => app.id !== 'logbook' && !enabled.includes(app.id)
                    );
                    if (notEnabled.length === 0) return null;
                    return (
                      <div className="pt-3 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Add another app</p>
                        {notEnabled.map((app) => (
                          <Button
                            key={app.id}
                            variant="outline"
                            className="w-full justify-start"
                            disabled={addingApp === app.id}
                            onClick={() => handleAddApp(app.id)}
                          >
                            {addingApp === app.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {app.name}
                          </Button>
                        ))}
                      </div>
                    );
                  })()}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Sign up a brand-new test user through `/signup` → `/signup/profile`, confirm landing on `/onboarding/apps`. Select BurnLog + MoneyLog, click Continue, confirm it sequences through BurnLog's `/ai-setup` then MoneyLog's `/moneylog/onboarding`, ending on `/logbook`. Then log in as an existing test user, visit `/profile`, confirm "Add another app" lists the apps not yet in their `enabledApps`, click one, confirm it routes through `/onboarding/sequence` and lands back on `/profile` (since that app has no onboarding route in `ONBOARDING_ROUTES` yet unless it's BurnLog/MoneyLog), and confirm `AppSwitcher` now includes it.

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no new errors beyond the two pre-existing unrelated warnings (`app/(burnlog)/goals/page.tsx`, `IdeaBreakdownReviewSheet.tsx`).

- [ ] **Step 7: Commit**

```bash
git add app/signup/profile/page.tsx app/profile/page.tsx
git commit -m "feat: route signup through app selection, add 'Add another app' to /profile"
```

---

## Post-plan note

This plan completes sub-project 2.0 (Onboarding Foundation). Sub-projects
2.1–2.4 (new AI-driven onboarding content for TaskLog, HomeLog,
SocialLog, and ShoppingLog, in that order) each build on
`ONBOARDING_ROUTES` in `app/onboarding/sequence/page.tsx` — adding an
entry there and a new onboarding route is how each later sub-project
plugs into this orchestrator. Each needs its own brainstorm → spec →
plan cycle.
