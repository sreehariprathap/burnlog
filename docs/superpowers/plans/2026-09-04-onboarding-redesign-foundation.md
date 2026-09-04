# Onboarding Redesign — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared parts of new-user onboarding (signup/profile, AI-insights consent, app selection, per-app step framing, finishing celebration) per the Foundation spec, without touching any individual app's onboarding *content*.

**Architecture:** Additive schema changes (`dateOfBirth`/`city`/`postalCode` on `Profile`, dropping `age`), a small `getAge()` helper replacing every `.age` read, three new top-level routes (`/onboarding/ai-insights`, `/onboarding/complete`, `/privacy`), a reworked `/signup/profile`, a gating fix on `/onboarding/apps`, and a lightweight `OnboardingStepShell` wrapper applied where it's low-risk (three onboarding page shells) — not force-fit into BurnLog's complex internal step machine.

**Tech Stack:** Next.js (App Router, client components), Prisma + Supabase Postgres, Vitest, existing `SiriOrb` / `FireworksBackground` / `SplashScreen` components.

**Spec:** `docs/superpowers/specs/2026-09-04-onboarding-redesign-foundation-design.md`

## Global Constraints

- No destructive edits to columns other users' code still needs mid-migration — `age` is dropped only after every reader is converted (Task 3 before Task 2's DROP COLUMN step... see ordering note in Task 2).
- `username` stays `@unique`, 3–20 chars, `^[a-z0-9_]{3,20}$` (`lib/username.ts`'s existing `isValidUsername`).
- Every new top-level shared screen (signup, onboarding/*) must force Logbook's theme via `setAppTheme('logbook')`, matching the existing `app/login/layout.tsx` pattern.
- The legal/privacy copy introduced here is an explicit placeholder — do not present it as reviewed legal text anywhere in code comments or UI copy.
- `AdminLog` must never appear as a selectable app in onboarding; `IntelLog` only appears when `aiEnabled` is true.

---

## Task 1: `getAge()` helper

**Files:**
- Create: `lib/age.ts`
- Test: `lib/age.test.ts`

**Interfaces:**
- Produces: `getAge(dateOfBirth: Date | string): number` — used by every later task that reads age.

- [ ] **Step 1: Write the failing test**

```ts
// lib/age.test.ts
import { describe, it, expect } from 'vitest';
import { getAge } from './age';

describe('getAge', () => {
  it('computes age for a birthday already passed this year', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 30, 0, 1);
    // Guard against the rare case "now" itself is Jan 1 (dob === now's month/day).
    if (now.getMonth() === 0 && now.getDate() === 1) {
      expect(getAge(dob)).toBe(30);
    } else {
      expect(getAge(dob)).toBe(30);
    }
  });

  it('computes age for a birthday not yet reached this year', () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dob = new Date(tomorrow);
    dob.setFullYear(tomorrow.getFullYear() - 30);
    expect(getAge(dob)).toBe(29);
  });

  it('accepts an ISO date string', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 25, 0, 1);
    expect(getAge(dob.toISOString())).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/age.test.ts`
Expected: FAIL — `Cannot find module './age'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/age.ts

/** Whole-number age as of today, from a date of birth (Date or ISO string). */
export function getAge(dateOfBirth: Date | string): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/age.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/age.ts lib/age.test.ts
git commit -m "feat(onboarding): add getAge() date-of-birth helper"
```

---

## Task 2: Schema — add dateOfBirth/city/postalCode, drop age

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260904010000_add_dob_location_drop_age/migration.sql`

**Interfaces:**
- Produces: `Profile.dateOfBirth: DateTime` (NOT NULL after backfill), `Profile.city: String?`, `Profile.postalCode: String?`. `Profile.age` no longer exists — Task 3 must land in the same deploy (or before, in a preceding migration step) or every `.age` reader breaks. Since this is a single-developer repo pushing directly, do Task 3 immediately after this task and before running the migration against the real database (see Step 4).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Find (from the earlier `hasSeenAppTour` addition):
```prisma
  age           Int
```
Replace with:
```prisma
  dateOfBirth   DateTime?
```
(nullable in the schema file itself so `prisma generate` doesn't require every existing in-flight object literal to supply it immediately — the migration below makes the *database* column NOT NULL; TypeScript callers are fixed in Task 3 regardless.)

Find:
```prisma
  country                  String?
```
Add directly after it:
```prisma
  city                     String?
  postalCode               String?
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- prisma/migrations/20260904010000_add_dob_location_drop_age/migration.sql

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN     "city" TEXT;
ALTER TABLE "profiles" ADD COLUMN     "postalCode" TEXT;

-- Backfill existing rows: Jan 1 of the inferred birth year. Lossy (no real
-- birthday), but every current consumer only ever needed a whole-number age.
UPDATE "profiles"
SET "dateOfBirth" = make_date((EXTRACT(YEAR FROM now())::int - "age"), 1, 1)
WHERE "dateOfBirth" IS NULL;

ALTER TABLE "profiles" ALTER COLUMN "dateOfBirth" SET NOT NULL;
ALTER TABLE "profiles" DROP COLUMN "age";
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Do NOT apply this migration to the database yet**

Task 3 must land first (it's all TypeScript, no DB dependency, so it's safe to write now) — applying this migration before Task 3 is committed would break every `.age` read against the live database. Once Task 3's commit lands, apply with the project's normal migration-push step (this repo has previously applied migrations directly against Supabase — reuse whatever command the last migration used; check `package.json` for a `db:push`/`migrate` script, else `npx prisma migrate deploy`).

- [ ] **Step 5: Commit (schema + migration file only, not yet applied)**

```bash
git add prisma/schema.prisma prisma/migrations/20260904010000_add_dob_location_drop_age
git commit -m "feat(onboarding): schema for dateOfBirth/city/postalCode, drop age"
```

---

## Task 3: Replace every `.age` read with `getAge(dateOfBirth)`

**Files:**
- Modify: `app/profile/page.tsx:275`
- Modify: `app/(burnlog)/burnlog/dashboard/config/page.tsx:36,44-55,110,136-141`
- Modify: `app/api/ai/estimate-workout-calories/route.ts:42,50`
- Modify: `app/api/ai/meal-plan/route.ts:36,56`
- Modify: `app/api/intellog/benchmark/route.ts:27,39`
- Modify: `app/api/cron/intel-cohort/route.ts:15,37`
- Modify: `lib/intellog/chatContext.ts` (the `profileRes`/`profileRow` block around line 82)
- Modify: `app/api/ai/program/route.ts:25` + the `generateProgram(profile, ...)` call
- Modify: `app/api/ai/workout-plan/route.ts:46` + the equivalent `generateWorkoutPlan`/`buildPrompt`-style call

**Interfaces:**
- Consumes: `getAge` from Task 1 (`lib/age.ts`).
- Note: `lib/ai/program.ts`, `lib/ai/openrouter.ts`, `lib/ai/mealPlanPrompt.ts` are **not modified** — they keep their existing `{ age: number, ... }` parameter shape; callers compute the number and pass it in, same as today.

- [ ] **Step 1: `app/profile/page.tsx`**

Find:
```tsx
                    ['Age', `${profile.age} yrs`],
```
Replace with:
```tsx
                    ['Age', `${getAge(profile.dateOfBirth)} yrs`],
```
Add the import near the top of the file:
```tsx
import { getAge } from '@/lib/age';
```
Also update the `.select(...)` on line 98 (`'id,firstName,lastName,age,height,weight,...'`) — replace `age` with `dateOfBirth` in that comma-separated string.

- [ ] **Step 2: `app/(burnlog)/burnlog/dashboard/config/page.tsx`**

Update the select on line 36: replace `age` with `dateOfBirth` in the comma-separated column list.

Replace the `handleHealthMetricChange` field union and add a dedicated DOB handler:
```tsx
  const handleHealthMetricChange = async (field: 'height' | 'weight', value: number) => {
    if (!profile) return;
    const min = field === 'height' ? 50 : 20;
    const max = field === 'height' ? 250 : 400;
    const safeValue = Math.min(max, Math.max(min, value));
    const { error } = await supabase.from('profiles').update({ [field]: safeValue }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, [field]: safeValue }));
    } else {
      toast({ title: 'Could not save health metric', description: error.message, variant: 'destructive' });
    }
  };

  const handleDateOfBirthChange = async (value: string) => {
    if (!profile || !value) return;
    const { error } = await supabase.from('profiles').update({ dateOfBirth: value }).eq('id', profile.id);
    if (!error) {
      setProfile((prev: any) => ({ ...prev, dateOfBirth: value }));
    } else {
      toast({ title: 'Could not save date of birth', description: error.message, variant: 'destructive' });
    }
  };
```

Replace the BMR line:
```tsx
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5);
```
with:
```tsx
  const bmr = Math.round(10 * profile.weight + 6.25 * profile.height - 5 * getAge(profile.dateOfBirth) + 5);
```

Replace the age `<input>` block:
```tsx
            <div>
              <Label htmlFor="age" className="text-xs font-normal text-muted-foreground">Age</Label>
              <input
                id="age" type="number" min={1} max={120} defaultValue={profile.age}
                onBlur={(e) => handleHealthMetricChange('age', Number(e.target.value))}
                className="w-full rounded-md border bg-background px-2 py-1 text-right mt-1"
              />
            </div>
```
with:
```tsx
            <div>
              <Label htmlFor="dob" className="text-xs font-normal text-muted-foreground">Date of birth</Label>
              <input
                id="dob" type="date" defaultValue={profile.dateOfBirth?.slice(0, 10)}
                onBlur={(e) => handleDateOfBirthChange(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1 text-right mt-1"
              />
            </div>
```

Add the import:
```tsx
import { getAge } from '@/lib/age';
```

- [ ] **Step 3: `app/api/ai/estimate-workout-calories/route.ts`**

Change the select on line 42 from `'id, weight, age'` to `'id, weight, dateOfBirth'`.
Change:
```ts
    const age = profile?.age ?? 30;
```
to:
```ts
    const age = profile?.dateOfBirth ? getAge(profile.dateOfBirth) : 30;
```
Add `import { getAge } from '@/lib/age';` near the top.

- [ ] **Step 4: `app/api/ai/meal-plan/route.ts`**

Change the select on line 36 from `'id, age, weight, lifestyle'` to `'id, dateOfBirth, weight, lifestyle'`.
Change line 56 from:
```ts
        { jobType: 'meal-plan', app: 'burnlog', model: MODEL },
        { age: profile.age, weight: profile.weight, lifestyle, customInstructions },
```
to:
```ts
        { jobType: 'meal-plan', app: 'burnlog', model: MODEL },
        { age: getAge(profile.dateOfBirth), weight: profile.weight, lifestyle, customInstructions },
```
and the nearby `{ age: profile.age ?? 30, weight: profile.weight ?? 70 }` (line ~60) to:
```ts
            { age: profile.dateOfBirth ? getAge(profile.dateOfBirth) : 30, weight: profile.weight ?? 70 },
```
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 5: `app/api/intellog/benchmark/route.ts`**

Change the select on line 27 from `'id, age, country'` to `'id, dateOfBirth, country'`.
Change line 39 from:
```ts
    const cohortKey = buildCohortKey(goal?.goalType ?? null, profile.age, profile.country);
```
to:
```ts
    const cohortKey = buildCohortKey(goal?.goalType ?? null, getAge(profile.dateOfBirth), profile.country);
```
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 6: `app/api/cron/intel-cohort/route.ts`**

Change the select on line 15 from `.select('id, age, country')` to `.select('id, dateOfBirth, country')`.
Change line 37 from:
```ts
  const ageByProfile = new Map((profiles ?? []).map((p: { id: string; age: number }) => [p.id, p.age]));
```
to:
```ts
  const ageByProfile = new Map((profiles ?? []).map((p: { id: string; dateOfBirth: string }) => [p.id, getAge(p.dateOfBirth)]));
```
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 7: `lib/intellog/chatContext.ts`**

Change the select `.select('age, country')` (line ~63) to `.select('dateOfBirth, country')`.
Change:
```ts
  const profileRow = profileRes.data as { age: number; country: string | null } | null;
  const age = profileRow?.age ?? 30;
```
to:
```ts
  const profileRow = profileRes.data as { dateOfBirth: string; country: string | null } | null;
  const age = profileRow?.dateOfBirth ? getAge(profileRow.dateOfBirth) : 30;
```
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 8: `app/api/ai/program/route.ts`**

Change the select on line 25 from `'id, age, weight, height, activityLevel'` to `'id, dateOfBirth, weight, height, activityLevel'`.
Find the call `generateProgram(profile, pastedPlanText, model, signal)` and change it to:
```ts
            const program = await generateProgram({ ...profile, age: getAge(profile.dateOfBirth) }, pastedPlanText, model, signal);
```
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 9: `app/api/ai/workout-plan/route.ts`**

Change the select on line 46 from `'id, age, weight, height, activityLevel'` to `'id, dateOfBirth, weight, height, activityLevel'`.
Find wherever `profile` is passed into the OpenRouter workout-plan generator (mirrors program.ts's pattern) and wrap it the same way: `{ ...profile, age: getAge(profile.dateOfBirth) }`.
Add `import { getAge } from '@/lib/age';`.

- [ ] **Step 10: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `.age` or the nine files above.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add app/profile/page.tsx "app/(burnlog)/burnlog/dashboard/config/page.tsx" app/api/ai/estimate-workout-calories/route.ts app/api/ai/meal-plan/route.ts app/api/intellog/benchmark/route.ts app/api/cron/intel-cohort/route.ts lib/intellog/chatContext.ts app/api/ai/program/route.ts app/api/ai/workout-plan/route.ts
git commit -m "refactor(onboarding): replace profile.age reads with getAge(dateOfBirth)"
```

- [ ] **Step 12: Apply the Task 2 migration now**

Run whatever command this repo uses to push a Prisma migration to the live Supabase database (check `package.json` scripts first; fall back to `npx prisma migrate deploy`). Verify with a read-only query (e.g. via the Supabase MCP `execute_sql` tool: `select column_name from information_schema.columns where table_name = 'profiles' and column_name in ('age','dateOfBirth','city','postalCode');`) that `age` is gone and the three new columns exist.

---

## Task 4: Username availability endpoint

**Files:**
- Create: `app/api/username-available/route.ts`
- Test: `app/api/username-available/route.test.ts`

**Interfaces:**
- Produces: `GET /api/username-available?u=<candidate>` → `{ available: boolean, reason?: string }`. Consumed by Task 6's signup/profile rework.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/username-available/route.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { GET } from './route';

function fakeSupabase(existingRow: { id: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
        }),
      }),
    }),
  };
}

describe('GET /api/username-available', () => {
  it('rejects an invalid username shape without querying the database', async () => {
    const req = new Request('http://localhost/api/username-available?u=a');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/3-20/);
  });

  it('returns available:true when no row exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSupabase(null));
    const req = new Request('http://localhost/api/username-available?u=validname');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(true);
  });

  it('returns available:false when a row already exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSupabase({ id: 'x' }));
    const req = new Request('http://localhost/api/username-available?u=taken');
    const res = await GET(req);
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/username-available/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/username-available/route.ts
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isValidUsername } from '@/lib/username';

// Public, unauthenticated by design — mirrors signup itself, which also
// runs before any session exists. Only ever reveals whether one exact
// username string is taken, nothing else.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const candidate = (searchParams.get('u') ?? '').toLowerCase();

  if (!isValidUsername(candidate)) {
    return NextResponse.json({ available: false, reason: 'Must be 3-20 lowercase letters, digits, or underscores' });
  }

  const admin = createServiceRoleClient();
  const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle();

  return NextResponse.json({ available: !data });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/username-available/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/username-available/route.ts app/api/username-available/route.test.ts
git commit -m "feat(onboarding): add username availability endpoint"
```

---

## Task 5: Force Logbook theme on signup/onboarding routes

**Files:**
- Create: `app/signup/layout.tsx`
- Create: `app/onboarding/layout.tsx`

**Interfaces:**
- Consumes: `setAppTheme` from `lib/appMode` (existing).

- [ ] **Step 1: Create `app/signup/layout.tsx`**

```tsx
// app/signup/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: Create `app/onboarding/layout.tsx`**

```tsx
// app/onboarding/layout.tsx
'use client';

import { useEffect } from 'react';
import { setAppTheme } from '@/lib/appMode';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAppTheme('logbook');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 3: Manual check**

Run: `npm run dev`, visit `/signup` and `/onboarding/apps` directly after having last visited a themed app (e.g. `/moneylog`) — confirm the page renders in Logbook's palette, not the previous app's.

- [ ] **Step 4: Commit**

```bash
git add app/signup/layout.tsx app/onboarding/layout.tsx
git commit -m "feat(onboarding): force Logbook theme on signup and onboarding routes"
```

---

## Task 6: Rework `/signup/profile`

**Files:**
- Modify: `app/signup/profile/page.tsx`

**Interfaces:**
- Consumes: `GET /api/username-available` (Task 4), `generateUsername`/`isValidUsername` (`lib/username.ts`, existing), `dateOfBirth`/`city`/`postalCode`/`country` columns (Task 2).
- Produces: on save, a `profiles` insert with `dateOfBirth`, `city`, `postalCode`, `country`, user-chosen `username` — no `age`/`weight`/`height`/`activityLevel`. Redirects to `/onboarding/ai-insights` instead of `/onboarding/apps`.

- [ ] **Step 1: Replace the form state**

Find:
```tsx
  const [age, setAge] = useState<number>(0);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<'low'|'medium'|'high'>('medium');
```
Replace with:
```tsx
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'taken' | 'invalid' | 'idle'>('idle');
```

- [ ] **Step 2: Prefill and live-check the username**

Add, right after `firstName`/`lastName` are set from user input (or on mount, once `firstName` is non-empty for the first time) — a `useEffect` seeding the suggestion once:
```tsx
  useEffect(() => {
    if (!username && firstName) {
      setUsername(generateUsername(firstName));
    }
  }, [firstName]);

  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle');
      return;
    }
    if (!isValidUsername(username)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-available?u=${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);
```
Add `import { generateUsername, isValidUsername } from '@/lib/username';` and keep the existing `useEffect`/`useState` import (already present).

- [ ] **Step 3: Replace the form JSX**

Find the height/weight/activityLevel form fields (the `<Input>`/`<Select>` block using `weight`, `height`, `activityLevel`, plus whatever `age` input exists) and replace that whole block with:
```tsx
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob" type="date" required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Vancouver" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal / ZIP code</Label>
                <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="V6B 1A1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username" required value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
                {usernameStatus === 'checking' && <p className="text-xs text-muted-foreground">Checking…</p>}
                {usernameStatus === 'available' && <p className="text-xs text-green-600">@{username} is available</p>}
                {usernameStatus === 'taken' && <p className="text-xs text-destructive">That username is taken</p>}
                {usernameStatus === 'invalid' && <p className="text-xs text-destructive">3-20 lowercase letters, digits, or underscores</p>}
              </div>
```
Remove the now-unused `Select`/`SelectContent`/etc. import if nothing else in the file uses it, and remove the `Ruler`/`Footprints` icon imports if unused elsewhere in the file.

- [ ] **Step 4: Update the insert and redirect**

Find:
```tsx
          .insert({
            userId,
            firstName, lastName,
            age, weight: parseFloat(weight),
            height: parseFloat(height),
            activityLevel,
            username: generateUsername(firstName),
          });
```
Replace with:
```tsx
          .insert({
            userId,
            firstName, lastName,
            dateOfBirth, city, country, postalCode,
            username,
          });
```
Also guard the submit button so it's disabled unless `usernameStatus === 'available'` (in addition to whatever loading guard already exists), since an unavailable/invalid username must not reach the insert.

Find (per the Foundation spec, this now points at the new AI-insights step instead of the app-selection screen):
```tsx
router.push('/onboarding/apps');
```
(if it isn't already there — confirm by searching the file; the prior "Onboarding Foundation" spec put it there) and replace with:
```tsx
router.push('/onboarding/ai-insights');
```

- [ ] **Step 5: Manual check**

Run: `npm run dev`, walk through `/signup` → `/signup/profile`: verify DOB/city/country/postal/username all save, username availability updates live, and Continue is blocked on a taken/invalid username.

- [ ] **Step 6: Commit**

```bash
git add app/signup/profile/page.tsx
git commit -m "feat(onboarding): collect DOB, location, and a chosen username at signup"
```

---

## Task 7: AI-insights consent step

**Files:**
- Create: `app/onboarding/ai-insights/page.tsx`

**Interfaces:**
- Consumes: `SiriOrb` (`components/smoothui/siri-orb`, existing), `createClient` (`lib/supabase/client`, existing).
- Produces: on Yes, `profiles.aiEnabled = true`; on No, `profiles.aiEnabled = false`, `profiles.learnLogAiEnabled = false`, `profiles.weeklyTripSuggestionsEnabled = false`. Either way, navigates to `/onboarding/apps`.

- [ ] **Step 1: Write the page**

```tsx
// app/onboarding/ai-insights/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import SiriOrb from '@/components/smoothui/siri-orb';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';

const BENEFITS = [
  'Your fitness coach adjusts your plan as your workouts and meals change.',
  'Your financial coach spots spending patterns and flags what to fix.',
  'Your task coach breaks a big goal into a concrete first week.',
];

export default function AiInsightsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function choose(aiEnabled: boolean) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const update: Record<string, boolean> = { aiEnabled };
    if (!aiEnabled) {
      update.learnLogAiEnabled = false;
      update.weeklyTripSuggestionsEnabled = false;
    }
    const { error } = await supabase.from('profiles').update(update).eq('userId', user.id);
    if (error) {
      toast({ title: 'Could not save your choice', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    router.push('/onboarding/apps');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 text-center">
      <SiriOrb size="140px" state={saving ? 'thinking' : 'idle'} />
      <div className="max-w-sm space-y-4">
        <h1 className="text-3xl font-bold">Let AI help set things up</h1>
        <ul className="space-y-2 text-left text-sm text-muted-foreground">
          {BENEFITS.map((b) => (
            <li key={b} className="flex gap-2">
              <span aria-hidden>✨</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" disabled={saving} onClick={() => choose(true)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, turn on AI'}
        </Button>
        <Button size="lg" variant="outline" disabled={saving} onClick={() => choose(false)}>
          Not right now
        </Button>
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">
        If you turn this on, your activity across the apps you use may be used to power AI features and improve how they work. See our{' '}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Manual check**

Run: `npm run dev`, visit `/onboarding/ai-insights` directly (skip the earlier steps for speed), click both buttons, confirm via the Supabase dashboard (or `execute_sql`) that `aiEnabled` and the two dependent flags land correctly for each path, and that both redirect to `/onboarding/apps`.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/ai-insights/page.tsx
git commit -m "feat(onboarding): add AI-insights consent step"
```

---

## Task 8: Gate and re-skin `/onboarding/apps`

**Files:**
- Modify: `components/AppSwitcher.tsx` (extract `AppIcon`)
- Create: `components/AppIcon.tsx`
- Modify: `app/onboarding/apps/page.tsx`

**Interfaces:**
- Produces: `AppIcon({ id: AppId, size: number }): JSX.Element`, exported from `components/AppIcon.tsx`, used by both `AppSwitcher` and the onboarding apps screen.

- [ ] **Step 1: Extract `AppIcon` into its own file**

Create `components/AppIcon.tsx` with exactly the function currently at `components/AppSwitcher.tsx:30-55`:
```tsx
// components/AppIcon.tsx
import { BurnLogMark } from '@/components/BurnLogMark';
import { LogbookMark } from '@/components/LogbookMark';
import { MoneyLogMark } from '@/components/MoneyLogMark';
import { TaskLogMark } from '@/components/TaskLogMark';
import { HomeLogMark } from '@/components/HomeLogMark';
import { SocialLogMark } from '@/components/SocialLogMark';
import { ShoppingLogMark } from '@/components/ShoppingLogMark';
import { TravelLogMark } from '@/components/TravelLogMark';
import { LearnLogMark } from '@/components/LearnLogMark';
import { AdminLogMark } from '@/components/AdminLogMark';
import { IntelLogMark } from '@/components/IntelLogMark';
import type { AppId } from '@/lib/appMode';

export function AppIcon({ id, size }: { id: AppId; size: number }) {
  switch (id) {
    case 'logbook':
      return <LogbookMark size={size} />;
    case 'moneylog':
      return <MoneyLogMark size={size} />;
    case 'tasklog':
      return <TaskLogMark size={size} />;
    case 'homelog':
      return <HomeLogMark size={size} />;
    case 'sociallog':
      return <SocialLogMark size={size} />;
    case 'shoppinglog':
      return <ShoppingLogMark size={size} />;
    case 'travellog':
      return <TravelLogMark size={size} />;
    case 'learnlog':
      return <LearnLogMark size={size} />;
    case 'adminlog':
      return <AdminLogMark size={size} />;
    case 'intellog':
      return <IntelLogMark size={size} />;
    default:
      return <BurnLogMark size={size} />;
  }
}
```

- [ ] **Step 2: Update `components/AppSwitcher.tsx` to import it**

Remove the local `function AppIcon(...) { ... }` block (lines 30-55) and the individual `*Mark` imports it used (keep any of those imports the rest of the file still uses elsewhere — check before deleting each one). Add:
```tsx
import { AppIcon } from '@/components/AppIcon';
```

- [ ] **Step 3: Rewrite `app/onboarding/apps/page.tsx`**

Replace:
```tsx
const SELECTABLE_APPS = Object.values(APPS).filter((app) => app.id !== 'logbook');
```
with a version gated on the caller's `aiEnabled` flag, fetched on mount:
```tsx
const SELECTABLE_APPS_BASE = Object.values(APPS).filter(
  (app) => app.id !== 'logbook' && app.id !== 'adminlog'
);
```
Add profile-fetch state at the top of the component:
```tsx
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('aiEnabled').eq('userId', user.id).single();
      setAiEnabled(!!data?.aiEnabled);
    })();
  }, []);
```
(add `useEffect` to the existing `useState` import from `'react'`)

Compute the filtered list inside the component body (after the `aiEnabled` state is declared):
```tsx
  const selectableApps = SELECTABLE_APPS_BASE.filter((app) => app.id !== 'intellog' || aiEnabled);
```
and use `selectableApps` (not `SELECTABLE_APPS`) in the `.map(...)` below.

Replace the card's icon-less header:
```tsx
                {isSelected && <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />}
                <span className="font-medium">{app.name}</span>
                <span className="text-xs text-muted-foreground">{app.tagline}</span>
```
with:
```tsx
                {isSelected && <Check className="absolute top-3 right-3 h-4 w-4 text-primary" />}
                <AppIcon id={app.id} size={32} />
                <span className="font-medium">{app.name}</span>
                <span className="text-xs text-muted-foreground">{app.tagline}</span>
```
Add `import { AppIcon } from '@/components/AppIcon';`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `components/AppSwitcher.tsx`, `components/AppIcon.tsx`, `app/onboarding/apps/page.tsx`.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Visit `/onboarding/apps` directly for a profile with `aiEnabled: false` — confirm IntelLog and AdminLog are both absent. Flip `aiEnabled` to `true` for that test profile and reload — confirm IntelLog now appears, AdminLog still doesn't. Confirm every card shows its real app mark.

- [ ] **Step 6: Commit**

```bash
git add components/AppIcon.tsx components/AppSwitcher.tsx app/onboarding/apps/page.tsx
git commit -m "feat(onboarding): icon-driven app picker, hide AdminLog, gate IntelLog on AI opt-in"
```

---

## Task 9: `OnboardingStepShell` — applied to MoneyLog/TaskLog/HomeLog onboarding pages

**Files:**
- Create: `components/onboarding/OnboardingStepShell.tsx`
- Modify: `app/(moneylog)/moneylog/onboarding/page.tsx`
- Modify: `app/(tasklog)/tasklog/onboarding/page.tsx`
- Modify: `app/(homelog)/homelog/onboarding/page.tsx`

**Scope note:** BurnLog's `/burnlog/ai-setup` is a large (367-line) flow with its own internal step chrome and skip/continue logic already threading `returnTo` correctly. Force-wrapping it in a generic shell here risks double-chrome and isn't needed for Foundation's goal (a consistent *frame*, not a rewrite of any app's internal step UI). Sub-project 2 (BurnLog onboarding), which is already touching this flow to add the new lifestyle/commute step, is the right place to adopt the shell for BurnLog specifically — noted there, not solved here.

**Interfaces:**
- Produces: `<OnboardingStepShell app={AppId}>{children}</OnboardingStepShell>` — sets that app's theme on mount (defensive; the surrounding route group's own layout already does this for these three, but the component is reusable outside a route group too) and renders children inside a centered, app-tinted card frame.

- [ ] **Step 1: Write the shell**

```tsx
// components/onboarding/OnboardingStepShell.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { setAppTheme, type AppId } from '@/lib/appMode';

interface OnboardingStepShellProps {
  app: AppId;
  children: ReactNode;
}

/** Consistent themed frame for a per-app onboarding page — sets that app's
 * theme on mount and centers its content in a card. Does not own any
 * skip/continue logic; each flow keeps its own (see the scope note in the
 * Foundation implementation plan, Task 9). */
export function OnboardingStepShell({ app, children }: OnboardingStepShellProps) {
  useEffect(() => {
    setAppTheme(app);
  }, [app]);

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 shadow-sm">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wrap `app/(moneylog)/moneylog/onboarding/page.tsx`**

Replace:
```tsx
    <div className="min-h-screen px-4 py-6">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <MoneyLogOnboardingFlow />
      </Suspense>
    </div>
```
with:
```tsx
    <OnboardingStepShell app="moneylog">
      <Suspense
        fallback={
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <MoneyLogOnboardingFlow />
      </Suspense>
    </OnboardingStepShell>
```
Add `import { OnboardingStepShell } from '@/components/onboarding/OnboardingStepShell';`.

- [ ] **Step 3: Wrap `app/(tasklog)/tasklog/onboarding/page.tsx` and `app/(homelog)/homelog/onboarding/page.tsx`**

Read each file first — apply the same pattern as Step 2: wrap whatever the outermost `<div className="min-h-screen ...">` (or equivalent) currently returns with `<OnboardingStepShell app="tasklog">...</OnboardingStepShell>` / `<OnboardingStepShell app="homelog">...</OnboardingStepShell>` respectively, importing the shell the same way.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Visit `/moneylog/onboarding`, `/tasklog/onboarding`, `/homelog/onboarding` directly — confirm each renders inside the new card frame, in its own app's theme, and that Skip/Continue inside each flow still work exactly as before (this task changes framing only).

- [ ] **Step 5: Commit**

```bash
git add components/onboarding/OnboardingStepShell.tsx "app/(moneylog)/moneylog/onboarding/page.tsx" "app/(tasklog)/tasklog/onboarding/page.tsx" "app/(homelog)/homelog/onboarding/page.tsx"
git commit -m "feat(onboarding): add OnboardingStepShell, apply to MoneyLog/TaskLog/HomeLog"
```

---

## Task 10: Finishing celebration screen

**Files:**
- Create: `app/onboarding/complete/page.tsx`
- Modify: `app/onboarding/sequence/page.tsx`

**Interfaces:**
- Consumes: `FireworksBackground` (`components/kokonutui/fireworks-background`, existing), `SPLASH_CONTENT.logbook` styling values (reference `components/SplashScreen.tsx` for the exact color tokens — do not import the whole splash component, just match its Logbook look with the mark/wordmark this task renders).
- Produces: the sequence orchestrator's default `returnTo` becomes `/onboarding/complete` instead of `/logbook`; that page's Continue button is the only thing that finally sends the user to `/logbook`.

- [ ] **Step 1: Write the completion page**

```tsx
// app/onboarding/complete/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { FireworksBackground } from '@/components/kokonutui/fireworks-background';
import { LogbookMark } from '@/components/LogbookMark';
import { Button } from '@/components/ui/button';

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden p-6 text-center">
      <FireworksBackground />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <LogbookMark size={64} />
        <h1 className="text-3xl font-bold">Welcome to LogBook</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Everything's set up — your day, across every app you picked, starts now.
        </p>
      </div>
      <Button size="lg" className="relative z-10" onClick={() => router.push('/logbook')}>
        Continue
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update the sequence orchestrator's default**

In `app/onboarding/sequence/page.tsx`, find:
```ts
    const returnTo = searchParams.get('returnTo') ?? '/logbook';
```
and change to:
```ts
    const returnTo = searchParams.get('returnTo') ?? '/onboarding/complete';
```

- [ ] **Step 3: Update the app-selection screen's initial call**

In `app/onboarding/apps/page.tsx`, the `handleContinue` function currently does:
```ts
    router.push(`/onboarding/sequence?apps=${chosen.join(',')}&step=0`);
```
This already omits `returnTo`, so it will pick up the new default from Step 2 automatically — no change needed here, but verify this call site during the manual check below.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Walk `/onboarding/apps` (pick zero optional per-app-onboarding apps, e.g. only SocialLog/ShoppingLog which have no `ONBOARDING_ROUTES` entry) through to the end — confirm it lands on `/onboarding/complete` with fireworks and the Logbook mark, and that Continue goes to `/logbook`. Also confirm a full BurnLog+MoneyLog run still ends here (not directly on `/logbook`).

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/complete/page.tsx app/onboarding/sequence/page.tsx
git commit -m "feat(onboarding): add finishing celebration screen"
```

---

## Task 11: Privacy page + disclaimer placeholder

**Files:**
- Create: `app/privacy/page.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: static `/privacy` route linked from Task 7's AI-insights step (already wired there).

- [ ] **Step 1: Write the page**

```tsx
// app/privacy/page.tsx
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 text-sm leading-relaxed text-muted-foreground">
      <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p className="rounded-md border border-dashed p-3 text-xs">
        Placeholder — this page has not been reviewed by a lawyer. Replace
        this content with reviewed privacy/data-use terms before real users
        rely on it.
      </p>
      <p>
        When you turn on AI features, activity you log across the apps you
        use (workouts, spending, tasks, and similar) may be sent to our AI
        provider to generate suggestions, and may be used to help us improve
        how our AI features work. You can turn AI features off at any time
        from Settings.
      </p>
      <p>
        We do not sell your personal data. Data you enter is stored to
        provide the product's functionality (tracking, history, and the
        insights you've opted into).
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Manual check**

Run: `npm run dev`, visit `/privacy` directly and via the link on `/onboarding/ai-insights` — confirm both work and the page renders in Logbook's theme (inherits from `app/onboarding/layout.tsx` only when reached from there; visited directly it has no forced theme, which is acceptable for a static informational page).

- [ ] **Step 3: Commit**

```bash
git add app/privacy/page.tsx
git commit -m "feat(onboarding): add placeholder privacy page"
```

---

## Final Verification

- [ ] Run `npx tsc --noEmit -p tsconfig.json` — zero errors.
- [ ] Run `npx eslint .` on all files touched across every task above — zero errors.
- [ ] Run `npx vitest run` — all tests pass, including the new `lib/age.test.ts` and `app/api/username-available/route.test.ts`.
- [ ] Run `npm run build` — succeeds.
- [ ] Full manual walkthrough: `/signup` → `/signup/profile` (DOB/location/username) → `/onboarding/ai-insights` (both Yes and No paths, in two separate test signups) → `/onboarding/apps` (confirm AdminLog absent always, IntelLog present only on the Yes path) → pick BurnLog + MoneyLog + SocialLog → confirm BurnLog's and MoneyLog's onboarding both still work (BurnLog unshelled, MoneyLog shelled) → confirm SocialLog (no onboarding route) is skipped straight through → `/onboarding/complete` (fireworks, Logbook mark, Continue) → `/logbook` → confirm the existing `AppTour` still fires on first arrival.
