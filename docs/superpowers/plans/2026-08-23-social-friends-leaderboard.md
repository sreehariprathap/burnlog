# Social — Friends & Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a friends system (username search, requests, accept/decline, unfriend) and a 3-metric (XP / streak / weekly-active-days) leaderboard among friends, on top of Burnlog's existing gamification data, exposing only aggregate numbers — never workout/food/finance detail.

**Architecture:** One new Prisma model (`Friendship`) plus a `username` column on `Profile`. All cross-user reads/writes (search, requests, leaderboard) go through new `app/api/social/*` route handlers that authenticate the caller via the existing `createRouteHandlerClient` + `supabase.auth.getUser()` pattern, then perform the actual data access with `createServiceRoleClient()` (`lib/supabase/serviceRole.ts`, already used by `app/api/cron/evening-checkin/route.ts`) — this is required because standard RLS restricts every user to their own `profiles` row, and social features are inherently cross-user. Authorization is therefore enforced in the route handlers themselves (explicit `WHERE`/`.eq()` scoping to the caller's own profile id), not by RLS, for these specific routes. A new `/social` tab and page round out the UI.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (`@supabase/auth-helpers-nextjs` for user auth, `@supabase/supabase-js` service-role client for cross-user access), Prisma (schema-only, `db push` — no migrations directory), Radix UI (`@/components/ui/*`, including `Tabs`, `Avatar`), Tailwind. No automated test framework — pure-logic modules use this repo's `*.selftest.ts` convention (assertion scripts run with `npx tsx`); API/UI changes are verified with `npx tsc --noEmit` and manual end-to-end passes through the running app.

## Global Constraints

- Schema changes go through `npx prisma db push` (no `prisma/migrations` directory). RLS is applied via the `mcp__supabase__apply_migration` tool (live Supabase MCP access is available in this environment) and mirrored into `supabase/rls.sql` as the version-controlled source of truth, per this repo's existing convention.
- Every `app/api/social/*` route must call `supabase.auth.getUser()` via `createRouteHandlerClient` first and return 401 if there's no user, exactly like every existing `app/api/ai/*` route.
- Every `app/api/social/*` route that reads/writes another user's data (or a `Friendship` row not owned by the caller) uses `createServiceRoleClient()` and must explicitly scope every query to the caller's own resolved `profiles.id` — never trust a client-supplied profile id for "who am I."
- No workout/food/weight/finance detail is ever returned by any social route — only `id`, `username`, `firstName`, `avatarUrl`, `xp`, `level`, `currentStreak`, and computed weekly-active-day counts.
- Reuse existing shared components/logic: `computeLevel` (`lib/leveling.ts`), `computeConsistencyWeek`/`getWeekRange` (`lib/consistency.ts`), `Card`/`Input`/`Button`/`Label`/`Tabs`/`Avatar`/`Drawer` (`@/components/ui/*`), the `TopBar`/`BottomNav` page shell pattern used by every other `(burnlog)` page.
- No new npm dependencies.

---

## File Structure

- **Modify** `prisma/schema.prisma` — add `username` to `Profile`, add `Friendship` model + relations.
- **Modify** `supabase/rls.sql` — mirror the `friendships` RLS policies.
- **Create** `lib/username.ts` — username generation/validation helpers.
- **Create** `lib/username.selftest.ts` — assertion script for `lib/username.ts`.
- **Modify** `app/signup/profile/page.tsx` — generate a username on profile creation, retry on collision.
- **Modify** `app/profile/page.tsx` — add an editable "Username" card.
- **Create** `app/api/social/username-available/route.ts` — availability check.
- **Create** `app/api/social/search/route.ts` — username prefix search.
- **Create** `app/api/social/requests/route.ts` — send request (POST), list incoming (GET).
- **Create** `app/api/social/requests/[id]/accept/route.ts` — accept a request.
- **Create** `app/api/social/requests/[id]/decline/route.ts` — decline a request.
- **Create** `app/api/social/friends/route.ts` — list accepted friends (GET).
- **Create** `app/api/social/friends/[id]/route.ts` — unfriend (DELETE).
- **Create** `app/api/social/leaderboard/route.ts` — ranked leaderboard by metric.
- **Create** `app/(burnlog)/social/_components/FriendSearch.tsx` — search + send-request UI.
- **Create** `app/(burnlog)/social/_components/FriendRequests.tsx` — incoming requests UI.
- **Create** `app/(burnlog)/social/_components/FriendsLeaderboard.tsx` — 3-tab leaderboard + friends list UI.
- **Create** `app/(burnlog)/social/page.tsx` — page shell wiring the three components together.
- **Modify** `components/BottomNav.tsx` — add the 5th "Social" tab.

---

### Task 1: `username` column — schema, generator, backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/username.ts`
- Test: `lib/username.selftest.ts`

**Interfaces:**
- Produces: `generateUsername(firstName: string): string`, `isValidUsername(username: string): boolean` from `@/lib/username`. Used by Task 2 (signup) and Task 4 (settings UI). `Profile.username: string` (unique) is used by every later task.

- [ ] **Step 1: Write the failing test**

Create `lib/username.selftest.ts`:

```ts
// lib/username.selftest.ts
export {};

async function main() {
  const { generateUsername, isValidUsername } = await import('./username');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  const u1 = generateUsername('Sree');
  assert(/^[a-z0-9]+_[a-z0-9]{4}$/.test(u1), `generated username matches slug_suffix shape (got "${u1}")`);
  assert(u1.startsWith('sree_'), `slug preserves lowercased first name (got "${u1}")`);

  const u2 = generateUsername('Sree');
  assert(u1 !== u2, 'two calls produce different suffixes (random collision extremely unlikely)');

  const u3 = generateUsername("O'Brien-Smith 2nd");
  assert(/^[a-z0-9]+_[a-z0-9]{4}$/.test(u3), `non-alphanumeric characters are stripped (got "${u3}")`);

  const u4 = generateUsername('');
  assert(u4.startsWith('user_'), `empty first name falls back to "user" (got "${u4}")`);

  assert(isValidUsername('sree_x7k2') === true, 'valid username accepted');
  assert(isValidUsername('ab') === false, 'too short is rejected');
  assert(isValidUsername('a'.repeat(21)) === false, 'too long is rejected');
  assert(isValidUsername('Sree_X7k2') === false, 'uppercase is rejected');
  assert(isValidUsername('sree x7k2') === false, 'spaces are rejected');
  assert(isValidUsername('sree.x7k2') === false, 'dots are rejected');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll username assertions passed');
}

main();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/username.selftest.ts`
Expected: FAIL — `Cannot find module './username'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/username.ts`:

```ts
// lib/username.ts

function slugifyName(firstName: string): string {
  const slug = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug.length > 0 ? slug : 'user';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/** Generates a candidate username like "sree_x7k2". Not guaranteed unique — callers must retry on a unique-constraint violation. */
export function generateUsername(firstName: string): string {
  return `${slugifyName(firstName)}_${randomSuffix()}`;
}

/** 3-20 chars, lowercase letters/digits/underscore only — enforced both for generated and user-edited usernames. */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(username);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/username.selftest.ts`
Expected: PASS — all `OK:` lines, ending with `All username assertions passed`.

- [ ] **Step 5: Add the `username` column in two phases (nullable → backfill → required)**

Edit `prisma/schema.prisma`. First add the column as nullable, in the `Profile` model, right after `waterGoalMl Int @default(2000)`:

```prisma
  waterGoalMl              Int       @default(2000)
  username                 String?   @unique
```

Run: `npx prisma db push`
Expected: ends with "Your database is now in sync with your Prisma schema."

- [ ] **Step 6: Backfill existing rows**

Use the `mcp__supabase__apply_migration` tool with `name: "backfill_profile_usernames"` and this `query`:

```sql
do $$
declare
  r record;
  candidate text;
  attempt int;
begin
  for r in select id, "firstName" from profiles where username is null loop
    attempt := 0;
    loop
      candidate := lower(regexp_replace(coalesce(r."firstName", ''), '[^a-zA-Z0-9]', '', 'g'));
      if candidate = '' then
        candidate := 'user';
      end if;
      candidate := candidate || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
      attempt := attempt + 1;
      exit when not exists (select 1 from profiles where username = candidate) or attempt > 10;
    end loop;
    update profiles set username = candidate where id = r.id;
  end loop;
end $$;
```

Expected: migration applies with no errors. Verify with `mcp__supabase__execute_sql` running `select count(*) from profiles where username is null;` — expect `0`.

- [ ] **Step 7: Make the column required**

Edit `prisma/schema.prisma`, change the field from Step 5 to non-nullable:

```prisma
  username                 String    @unique
```

Run: `npx prisma db push`
Expected: ends with "Your database is now in sync with your Prisma schema." (succeeds now that no rows have a null username).

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/username.ts lib/username.selftest.ts
git commit -m "feat: add unique username column to Profile with generator and backfill"
```

---

### Task 2: `Friendship` model and RLS

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `friendships` table (`id`, `requesterId`, `addresseeId`, `status: 'pending'|'accepted'`, `createdAt`, `respondedAt`), used by Tasks 5–9 (all `/api/social/*` routes) via `createServiceRoleClient()`.

- [ ] **Step 1: Add the relation fields and the model**

Edit `prisma/schema.prisma`. Add two relation lines to the `Profile` model, right after `Program Program?`:

```prisma
  Program            Program?
  friendshipsSent     Friendship[] @relation("FriendshipRequester")
  friendshipsReceived Friendship[] @relation("FriendshipAddressee")
```

Append this model at the end of the file, after the `ProgramWeek` model:

```prisma
/// friend relationship — one row per requested pair; deleted on decline/unfriend
model Friendship {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  requesterId String    @db.Uuid
  addresseeId String    @db.Uuid
  status      String    @default("pending") // 'pending' | 'accepted'
  createdAt   DateTime  @default(now())
  respondedAt DateTime?

  requester Profile @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee Profile @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@map("friendships")
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: ends with "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Add RLS policies via the live Supabase connection**

Use the `mcp__supabase__apply_migration` tool with `name: "friendships_rls"` and this `query`:

```sql
alter table friendships enable row level security;

create policy "friendships_select_own" on friendships
  for select using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_insert_own" on friendships
  for insert with check (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
  );

create policy "friendships_update_addressee" on friendships
  for update using (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  )
  with check (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_delete_own" on friendships
  for delete using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );
```

Expected: migration applies with no errors. Verify with `mcp__supabase__list_tables` (schemas: `["public"]`, verbose: `false`) — confirm `friendships` appears with `"rls_enabled": true`.

- [ ] **Step 4: Mirror into `supabase/rls.sql`**

Read `supabase/rls.sql` first to find the end of the file, then append a new section:

```sql

-- friendships -----------------------------------------------------------
-- Not accessed directly by client-side Supabase calls (all social features
-- go through app/api/social/* routes using the service-role client, which
-- bypasses RLS and does its own authorization). RLS is still enabled here
-- as a defensive default matching every other table in this file.
alter table friendships enable row level security;

create policy "friendships_select_own" on friendships
  for select using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_insert_own" on friendships
  for insert with check (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
  );

create policy "friendships_update_addressee" on friendships
  for update using (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  )
  with check (
    exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );

create policy "friendships_delete_own" on friendships
  for delete using (
    exists (select 1 from profiles where profiles.id = friendships."requesterId" and profiles."userId" = auth.uid())
    or exists (select 1 from profiles where profiles.id = friendships."addresseeId" and profiles."userId" = auth.uid())
  );
```

- [ ] **Step 5: Verify the app still builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add Friendship model and RLS policies"
```

---

### Task 3: Generate a username at signup

**Files:**
- Modify: `app/signup/profile/page.tsx`

**Interfaces:**
- Consumes: `generateUsername` from `@/lib/username` (Task 1).
- Produces: no external consumers — every new `Profile` row now always has a `username`.

- [ ] **Step 1: Add the import**

Edit `app/signup/profile/page.tsx`. Add near the top with the other imports:

```ts
import { generateUsername } from '@/lib/username';
```

- [ ] **Step 2: Replace the insert with a retry-on-collision loop**

Replace the existing insert block (currently):

```ts
      // Create new profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ 
          userId,
          firstName, lastName,
          age, weight: parseFloat(weight),
          height: parseFloat(height),
          activityLevel
        });
      
      if (profileError) {
        console.error("Profile error:", profileError);
        setError(profileError.message);
      } else {
        router.push('/ai-setup');
      }
```

with:

```ts
      // Create new profile, retrying the auto-generated username on the
      // rare unique-constraint collision (Postgres error code 23505).
      let profileError: { code?: string; message: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await supabase
          .from('profiles')
          .insert({
            userId,
            firstName, lastName,
            age, weight: parseFloat(weight),
            height: parseFloat(height),
            activityLevel,
            username: generateUsername(firstName),
          });
        profileError = result.error;
        if (!profileError || profileError.code !== '23505') break;
      }

      if (profileError) {
        console.error("Profile error:", profileError);
        setError(profileError.message);
      } else {
        router.push('/ai-setup');
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign up a new test account through `/signup` → `/signup/profile`. Confirm the profile is created successfully and (via `mcp__supabase__execute_sql` running `select username from profiles order by "createdAt" desc limit 1;`) a `firstname_xxxx`-shaped username was assigned.

- [ ] **Step 5: Commit**

```bash
git add app/signup/profile/page.tsx
git commit -m "feat: generate a username on profile creation"
```

---

### Task 4: Username settings — availability API + editable field on `/profile`

**Files:**
- Create: `app/api/social/username-available/route.ts`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `isValidUsername` from `@/lib/username` (Task 1).
- Produces: `GET /api/social/username-available?u=` → `{ available: boolean }` on success or `{ error: string }` with non-2xx status. Consumed by the new username field in this task; no other consumers.

- [ ] **Step 1: Write the availability route**

Create `app/api/social/username-available/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isValidUsername } from '@/lib/username';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const u = (searchParams.get('u') ?? '').toLowerCase();

    if (!isValidUsername(u)) {
      return NextResponse.json({ available: false, error: 'Usernames are 3-20 lowercase letters, digits, or underscores' });
    }

    const admin = createServiceRoleClient();
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('username', u)
      .maybeSingle();

    const isOwnCurrentUsername =
      !!existing &&
      (await admin.from('profiles').select('userId').eq('id', existing.id).single()).data?.userId === user.id;

    return NextResponse.json({ available: !existing || isOwnCurrentUsername });
  } catch (error) {
    console.error('username-available error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Add `username` to the profile select query**

Edit `app/profile/page.tsx`. In the `.select(...)` call inside the profile-loading `useEffect` (around line 75), add `username` to the column list:

```ts
          .select('id,firstName,lastName,age,weight,height,activityLevel,aiEnabled,isAdmin,currentStreak,longestStreak,xp,level,avatarUrl,waterUnit,glassSizeMl,waterGoalMl,username')
```

- [ ] **Step 4: Add username edit state and handler**

Edit `app/profile/page.tsx`. Add new state alongside the existing `useState` declarations near the top of the component:

```ts
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null);
```

Add an effect to seed `usernameInput` once the profile loads, right after the existing profile-loading `useEffect` (after its closing `}, [supabase, router]);`):

```ts
  useEffect(() => {
    if (profile?.username) {
      setUsernameInput(profile.username);
    }
  }, [profile?.username]);

  useEffect(() => {
    if (!profile || usernameInput === profile.username || usernameInput.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    let cancelled = false;
    setUsernameStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social/username-available?u=${encodeURIComponent(usernameInput)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setUsernameStatus('invalid');
        } else {
          setUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setUsernameStatus('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [usernameInput, profile]);

  const handleSaveUsername = async () => {
    if (!profile || usernameStatus !== 'available') return;
    setSavingUsername(true);
    setUsernameSaveError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ username: usernameInput })
      .eq('id', profile.id);
    if (error) {
      setUsernameSaveError(error.code === '23505' ? 'That username was just taken — try another.' : error.message);
    } else {
      setProfile((prev: any) => ({ ...prev, username: usernameInput }));
      setUsernameStatus('idle');
    }
    setSavingUsername(false);
  };
```

- [ ] **Step 5: Add the Username card to the JSX**

Edit `app/profile/page.tsx`. Insert a new card right after the closing `</Card>` of the "Personal Info" card (after the block ending `</CardContent>\n              </Card>` that follows the `['Activity Level', profile.activityLevel]` row):

```tsx
              {/* Username */}
              <Card>
                <CardHeader>
                  <CardTitle>Username</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Friends find you by this username on the Social tab.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      placeholder="username"
                    />
                    <Button
                      onClick={handleSaveUsername}
                      disabled={usernameStatus !== 'available' || savingUsername}
                    >
                      {savingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  {usernameStatus === 'checking' && <p className="text-xs text-muted-foreground">Checking availability…</p>}
                  {usernameStatus === 'available' && <p className="text-xs text-green-600">Available</p>}
                  {usernameStatus === 'taken' && <p className="text-xs text-red-500">Already taken</p>}
                  {usernameStatus === 'invalid' && <p className="text-xs text-red-500">3-20 lowercase letters, digits, or underscores</p>}
                  {usernameSaveError && <p className="text-xs text-red-500">{usernameSaveError}</p>}
                </CardContent>
              </Card>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open `/profile`. Confirm the Username card shows the auto-generated username, editing it shows "Checking availability…" then "Available"/"Already taken", Save is disabled until "Available", and saving persists (reload the page and confirm the new username sticks).

- [ ] **Step 8: Commit**

```bash
git add app/api/social/username-available/route.ts app/profile/page.tsx
git commit -m "feat: add editable username field with availability check to profile settings"
```

---

### Task 5: `/api/social/search` — find users by username

**Files:**
- Create: `app/api/social/search/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient` (`@/lib/supabase/serviceRole`), `computeLevel` (`@/lib/leveling`).
- Produces: `GET /api/social/search?q=` → `{ results: { id: string; username: string; firstName: string; level: number }[] }`. `id` is the target `profiles.id`. Excludes the caller and anyone with an existing `Friendship` row (either status, either direction). Consumed by `FriendSearch` (Task 10).

- [ ] **Step 1: Write the route**

Create `app/api/social/search/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const admin = createServiceRoleClient();

    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existing } = await admin
      .from('friendships')
      .select('requesterId, addresseeId')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const excluded = new Set<string>([me.id]);
    for (const row of existing ?? []) {
      excluded.add(row.requesterId === me.id ? row.addresseeId : row.requesterId);
    }

    const { data: matches } = await admin
      .from('profiles')
      .select('id, username, firstName, xp')
      .ilike('username', `${q}%`)
      .limit(20);

    const results = (matches ?? [])
      .filter((m) => !excluded.has(m.id))
      .map((m) => ({ id: m.id, username: m.username, firstName: m.firstName, level: computeLevel(m.xp) }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('social search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/social/search/route.ts
git commit -m "feat: add friend search API by username prefix"
```

---

### Task 6: `/api/social/requests` — send + list incoming

**Files:**
- Create: `app/api/social/requests/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient`.
- Produces:
  - `POST /api/social/requests` body `{ addresseeUsername: string }` → `{ id: string }` on success, or `{ error: string }` (400 for self/duplicate/not-found, 401 unauthenticated).
  - `GET /api/social/requests` → `{ incoming: { id: string; requesterId: string; requesterUsername: string; requesterFirstName: string; requesterLevel: number; createdAt: string }[] }`.
  - Both consumed by `FriendRequests`/`FriendSearch` (Task 10).

- [ ] **Step 1: Write the route**

Create `app/api/social/requests/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

async function getMyProfileId(admin: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { addresseeUsername } = body as { addresseeUsername?: string };
    if (!addresseeUsername?.trim()) {
      return NextResponse.json({ error: 'addresseeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: addressee } = await admin
      .from('profiles')
      .select('id')
      .eq('username', addresseeUsername.trim().toLowerCase())
      .maybeSingle();

    if (!addressee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (addressee.id === meId) {
      return NextResponse.json({ error: "You can't add yourself" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from('friendships')
      .select('id, status')
      .or(
        `and(requesterId.eq.${meId},addresseeId.eq.${addressee.id}),and(requesterId.eq.${addressee.id},addresseeId.eq.${meId})`
      )
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: existing.status === 'accepted' ? 'Already friends' : 'A request already exists' },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from('friendships')
      .insert({ requesterId: meId, addresseeId: addressee.id })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ id: inserted.id });
  } catch (error) {
    console.error('send friend request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: rows } = await admin
      .from('friendships')
      .select('id, requesterId, createdAt, requester:profiles!friendships_requesterId_fkey(username, firstName, xp)')
      .eq('addresseeId', meId)
      .eq('status', 'pending');

    const incoming = (rows ?? []).map((r: any) => ({
      id: r.id,
      requesterId: r.requesterId,
      requesterUsername: r.requester.username,
      requesterFirstName: r.requester.firstName,
      requesterLevel: computeLevel(r.requester.xp),
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ incoming });
  } catch (error) {
    console.error('list friend requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the Supabase foreign-key relation name**

Run: `mcp__supabase__execute_sql` with query `select conname from pg_constraint where conrelid = 'friendships'::regclass and contype = 'f';`
Expected: two rows, one of them named `friendships_requesterId_fkey` (Prisma's default FK naming — matches the `requester:profiles!friendships_requesterId_fkey(...)` embed used above). If the actual name differs, update the embed hint in `route.ts`'s `GET` handler to match.

- [ ] **Step 4: Commit**

```bash
git add app/api/social/requests/route.ts
git commit -m "feat: add send/list friend request API"
```

---

### Task 7: Accept / decline a friend request

**Files:**
- Create: `app/api/social/requests/[id]/accept/route.ts`
- Create: `app/api/social/requests/[id]/decline/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient`.
- Produces: `POST /api/social/requests/:id/accept` and `POST /api/social/requests/:id/decline`, both → `{ success: true }` on success or `{ error: string }` (403 if the caller isn't the addressee, 404 if the request doesn't exist). Consumed by `FriendRequests` (Task 10).

- [ ] **Step 1: Write the accept route**

Create `app/api/social/requests/[id]/accept/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: request_, error: fetchError } = await admin
      .from('friendships')
      .select('id, addresseeId, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !request_) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request_.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Not your request to accept' }, { status: 403 });
    }
    if (request_.status !== 'pending') {
      return NextResponse.json({ error: 'Request is no longer pending' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('friendships')
      .update({ status: 'accepted', respondedAt: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('accept friend request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the decline route**

Create `app/api/social/requests/[id]/decline/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: request_, error: fetchError } = await admin
      .from('friendships')
      .select('id, addresseeId, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !request_) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request_.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Not your request to decline' }, { status: 403 });
    }

    const { error: deleteError } = await admin.from('friendships').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('decline friend request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/social/requests/[id]/accept/route.ts app/api/social/requests/[id]/decline/route.ts
git commit -m "feat: add accept/decline friend request API"
```

---

### Task 8: `/api/social/friends` — list + unfriend

**Files:**
- Create: `app/api/social/friends/route.ts`
- Create: `app/api/social/friends/[id]/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient`, `computeLevel`.
- Produces:
  - `GET /api/social/friends` → `{ friends: { friendshipId: string; profileId: string; username: string; firstName: string; avatarUrl: string | null; xp: number; level: number; currentStreak: number }[] }`.
  - `DELETE /api/social/friends/:id` (id = `friendshipId`) → `{ success: true }` or `{ error: string }` (403/404).
  - Both consumed by `FriendsLeaderboard` (Task 11).

- [ ] **Step 1: Write the list route**

Create `app/api/social/friends/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: rows } = await admin
      .from('friendships')
      .select('id, requesterId, addresseeId')
      .eq('status', 'accepted')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const friendIds = (rows ?? []).map((r) => (r.requesterId === me.id ? r.addresseeId : r.requesterId));
    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl, xp, currentStreak')
      .in('id', friendIds);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const friends = (rows ?? [])
      .map((r) => {
        const friendId = r.requesterId === me.id ? r.addresseeId : r.requesterId;
        const p = profileById.get(friendId);
        if (!p) return null;
        return {
          friendshipId: r.id,
          profileId: p.id,
          username: p.username,
          firstName: p.firstName,
          avatarUrl: p.avatarUrl,
          xp: p.xp,
          level: computeLevel(p.xp),
          currentStreak: p.currentStreak,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return NextResponse.json({ friends });
  } catch (error) {
    console.error('list friends error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the unfriend route**

Create `app/api/social/friends/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: friendship, error: fetchError } = await admin
      .from('friendships')
      .select('id, requesterId, addresseeId')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !friendship) {
      return NextResponse.json({ error: 'Friendship not found' }, { status: 404 });
    }
    if (friendship.requesterId !== me.id && friendship.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Not your friendship to remove' }, { status: 403 });
    }

    const { error: deleteError } = await admin.from('friendships').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('unfriend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/social/friends/route.ts app/api/social/friends/[id]/route.ts
git commit -m "feat: add list friends and unfriend API"
```

---

### Task 9: `/api/social/leaderboard` — XP / streak / weekly ranking

**Files:**
- Create: `app/api/social/leaderboard/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient`, `computeLevel` (`@/lib/leveling`), `computeConsistencyWeek`, `getWeekRange` (`@/lib/consistency`).
- Produces: `GET /api/social/leaderboard?metric=xp|streak|weekly` → `{ entries: { profileId: string; username: string; firstName: string; avatarUrl: string | null; level: number; value: number; rank: number; isSelf: boolean }[] }`. `value` is xp/streak/active-day-count depending on `metric`. Consumed by `FriendsLeaderboard` (Task 11).

- [ ] **Step 1: Write the route**

Create `app/api/social/leaderboard/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';
import { computeConsistencyWeek, getWeekRange } from '@/lib/consistency';

const TABLES_WITH_DATE = ['sessions', 'calorie_burns', 'food_intakes', 'step_entries', 'stamina_sessions', 'weight_entries'] as const;
const METRICS = ['xp', 'streak', 'weekly'] as const;
type Metric = (typeof METRICS)[number];

function toLocalDateString(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const metric = (searchParams.get('metric') ?? 'xp') as Metric;
    if (!METRICS.includes(metric)) {
      return NextResponse.json({ error: 'metric must be one of xp, streak, weekly' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: rows } = await admin
      .from('friendships')
      .select('requesterId, addresseeId')
      .eq('status', 'accepted')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const profileIds = new Set<string>([me.id]);
    for (const r of rows ?? []) {
      profileIds.add(r.requesterId === me.id ? r.addresseeId : r.requesterId);
    }
    const ids = Array.from(profileIds);

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl, xp, currentStreak')
      .in('id', ids);

    let valueById = new Map<string, number>();

    if (metric === 'xp') {
      valueById = new Map((profiles ?? []).map((p) => [p.id, p.xp]));
    } else if (metric === 'streak') {
      valueById = new Map((profiles ?? []).map((p) => [p.id, p.currentStreak]));
    } else {
      const { start, end } = getWeekRange();
      const activeDatesByProfile = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));

      await Promise.all(
        TABLES_WITH_DATE.map(async (table) => {
          const { data: dateRows } = await admin
            .from(table)
            .select('profileId, date')
            .in('profileId', ids)
            .gte('date', start.toISOString())
            .lt('date', end.toISOString());
          for (const row of dateRows ?? []) {
            activeDatesByProfile.get(row.profileId)?.add(toLocalDateString(row.date));
          }
        })
      );

      for (const id of ids) {
        const { activeCount } = computeConsistencyWeek(activeDatesByProfile.get(id) ?? new Set());
        valueById.set(id, activeCount);
      }
    }

    const entries = (profiles ?? [])
      .map((p) => ({
        profileId: p.id,
        username: p.username,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        level: computeLevel(p.xp),
        value: valueById.get(p.id) ?? 0,
        isSelf: p.id === me.id,
      }))
      .sort((a, b) => b.value - a.value)
      .map((e, index) => ({ ...e, rank: index + 1 }));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/social/leaderboard/route.ts
git commit -m "feat: add friends leaderboard API with xp/streak/weekly metrics"
```

---

### Task 10: `FriendSearch` + `FriendRequests` components and the `/social` page shell

**Files:**
- Create: `app/(burnlog)/social/_components/FriendSearch.tsx`
- Create: `app/(burnlog)/social/_components/FriendRequests.tsx`
- Create: `app/(burnlog)/social/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/social/requests`, `GET /api/social/search`, `POST /api/social/requests/:id/accept`, `POST /api/social/requests/:id/decline` (Tasks 5–7).
- Produces: `FriendSearch({ onRequestSent: () => void })`, `FriendRequests({ refreshKey: number, onChanged: () => void })` — both consumed only by the new `app/(burnlog)/social/page.tsx` in this task. `page.tsx` also renders `FriendsLeaderboard` from Task 11 (added there).

- [ ] **Step 1: Write `FriendSearch`**

Create `app/(burnlog)/social/_components/FriendSearch.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type SearchResult = { id: string; username: string; firstName: string; level: number };

type FriendSearchProps = {
  onRequestSent: () => void;
};

export function FriendSearch({ onRequestSent }: FriendSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [sentUsernames, setSentUsernames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/social/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Search failed');
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError('Network error');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (username: string) => {
    setSendingUsername(username);
    setError(null);
    try {
      const res = await fetch('/api/social/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresseeUsername: username }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to send request');
        return;
      }
      setSentUsernames((prev) => new Set(prev).add(username));
      onRequestSent();
    } catch {
      setError('Network error');
    } finally {
      setSendingUsername(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Friends</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by username"
        />
        {searching && <Loader2 className="h-4 w-4 animate-spin" />}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {results.map((r) => (
          <div key={r.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.firstName}</p>
              <p className="text-xs text-muted-foreground">@{r.username} · Level {r.level}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={sendingUsername === r.username || sentUsernames.has(r.username)}
              onClick={() => handleSendRequest(r.username)}
            >
              {sendingUsername === r.username ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sentUsernames.has(r.username) ? (
                'Sent'
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" /> Add
                </>
              )}
            </Button>
          </div>
        ))}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `FriendRequests`**

Create `app/(burnlog)/social/_components/FriendRequests.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type IncomingRequest = {
  id: string;
  requesterUsername: string;
  requesterFirstName: string;
  requesterLevel: number;
};

type FriendRequestsProps = {
  refreshKey: number;
  onChanged: () => void;
};

export function FriendRequests({ refreshKey, onChanged }: FriendRequestsProps) {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/social/requests');
        const data = await res.json();
        if (!cancelled) setRequests(data.incoming ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/social/requests/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to update request');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      onChanged();
    } catch {
      setError('Network error');
    } finally {
      setActingId(null);
    }
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friend Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.requesterFirstName}</p>
              <p className="text-xs text-muted-foreground">@{r.requesterUsername} · Level {r.requesterLevel}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={actingId === r.id} onClick={() => respond(r.id, 'accept')}>
                {actingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" disabled={actingId === r.id} onClick={() => respond(r.id, 'decline')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write the page shell (leaderboard added in Task 11)**

Create `app/(burnlog)/social/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { FriendSearch } from './_components/FriendSearch';
import { FriendRequests } from './_components/FriendRequests';

export default function SocialPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Social" />
      <main className="flex-1 container mx-auto p-4 pb-24 space-y-4">
        <FriendRequests refreshKey={refreshKey} onChanged={bump} />
        <FriendSearch onRequestSent={bump} />
      </main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate directly to `/social` (no nav tab yet — added in Task 12). Using two test accounts (two browsers/incognito windows), search account B's username from account A, send a request, confirm it appears under "Friend Requests" on account B, and accept/decline both work and remove the row.

- [ ] **Step 6: Commit**

```bash
git add "app/(burnlog)/social/_components/FriendSearch.tsx" "app/(burnlog)/social/_components/FriendRequests.tsx" "app/(burnlog)/social/page.tsx"
git commit -m "feat: add friend search, incoming requests, and /social page shell"
```

---

### Task 11: `FriendsLeaderboard` — 3-tab leaderboard + friends list

**Files:**
- Create: `app/(burnlog)/social/_components/FriendsLeaderboard.tsx`
- Modify: `app/(burnlog)/social/page.tsx`

**Interfaces:**
- Consumes: `GET /api/social/leaderboard?metric=` (Task 9), `GET /api/social/friends` + `DELETE /api/social/friends/:id` (Task 8).
- Produces: `FriendsLeaderboard({ refreshKey: number })`, rendered by `page.tsx`. No other consumers.

- [ ] **Step 1: Write `FriendsLeaderboard`**

Create `app/(burnlog)/social/_components/FriendsLeaderboard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trophy, UserMinus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Metric = 'xp' | 'streak' | 'weekly';

type LeaderboardEntry = {
  profileId: string;
  username: string;
  firstName: string;
  avatarUrl: string | null;
  level: number;
  value: number;
  rank: number;
  isSelf: boolean;
};

type Friend = {
  friendshipId: string;
  profileId: string;
  username: string;
  firstName: string;
};

const METRIC_LABEL: Record<Metric, string> = {
  xp: 'XP',
  streak: 'Streak',
  weekly: 'This Week',
};

function valueLabel(metric: Metric, value: number): string {
  if (metric === 'xp') return `${value} xp`;
  if (metric === 'streak') return `${value} day${value === 1 ? '' : 's'}`;
  return `${value}/7 days`;
}

type FriendsLeaderboardProps = {
  refreshKey: number;
};

export function FriendsLeaderboard({ refreshKey }: FriendsLeaderboardProps) {
  const [metric, setMetric] = useState<Metric>('xp');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [leaderboardRes, friendsRes] = await Promise.all([
          fetch(`/api/social/leaderboard?metric=${metric}`),
          fetch('/api/social/friends'),
        ]);
        const leaderboardData = await leaderboardRes.json();
        const friendsData = await friendsRes.json();
        if (!cancelled) {
          setEntries(leaderboardData.entries ?? []);
          setFriends(friendsData.friends ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metric, refreshKey]);

  const handleUnfriend = async (friendshipId: string) => {
    setRemovingId(friendshipId);
    try {
      await fetch(`/api/social/friends/${friendshipId}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.isSelf || friends.find((f) => f.friendshipId === friendshipId)?.profileId !== e.profileId));
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    } finally {
      setRemovingId(null);
    }
  };

  const hasNoFriends = !loading && friends.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasNoFriends ? (
          <p className="text-sm text-muted-foreground">
            No friends yet — search above to add someone.
          </p>
        ) : (
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="grid grid-cols-3">
              {(['xp', 'streak', 'weekly'] as Metric[]).map((m) => (
                <TabsTrigger key={m} value={m}>{METRIC_LABEL[m]}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={metric} className="space-y-2 pt-3">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              ) : (
                entries.map((e) => {
                  const friend = friends.find((f) => f.profileId === e.profileId);
                  return (
                    <div
                      key={e.profileId}
                      className={cn(
                        'flex items-center justify-between rounded-md p-2',
                        e.isSelf && 'bg-primary/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-sm text-muted-foreground text-center">{e.rank}</span>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={e.avatarUrl ?? undefined} />
                          <AvatarFallback>{e.firstName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{e.isSelf ? 'You' : e.firstName}</p>
                          <p className="text-xs text-muted-foreground">Level {e.level}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{valueLabel(metric, e.value)}</span>
                        {!e.isSelf && friend && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={removingId === friend.friendshipId}
                            onClick={() => handleUnfriend(friend.friendshipId)}
                          >
                            {removingId === friend.friendshipId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserMinus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the page**

Edit `app/(burnlog)/social/page.tsx`. Add the import:

```ts
import { FriendsLeaderboard } from './_components/FriendsLeaderboard';
```

Add `<FriendsLeaderboard refreshKey={refreshKey} />` right after `<FriendRequests refreshKey={refreshKey} onChanged={bump} />`:

```tsx
        <FriendRequests refreshKey={refreshKey} onChanged={bump} />
        <FriendsLeaderboard refreshKey={refreshKey} />
        <FriendSearch onRequestSent={bump} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, with two already-friended test accounts (from Task 10's verification), open `/social` on each. Confirm the leaderboard shows both accounts ranked, "You" is highlighted, switching XP/Streak/This Week tabs re-ranks correctly, and the unfriend button removes the friend from both the leaderboard and the friends list (confirm on the other account too, e.g. by refreshing).

- [ ] **Step 5: Commit**

```bash
git add "app/(burnlog)/social/_components/FriendsLeaderboard.tsx" "app/(burnlog)/social/page.tsx"
git commit -m "feat: add friends leaderboard with xp/streak/weekly tabs and unfriend"
```

---

### Task 12: Add the "Social" tab to `BottomNav`

**Files:**
- Modify: `components/BottomNav.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no external consumers — terminal task.

- [ ] **Step 1: Add the icon import and tab entry**

Edit `components/BottomNav.tsx`. Add `UsersIcon` to the lucide-react import:

```ts
import {
  HomeIcon,
  DumbbellIcon,
  TargetIcon,
  ChartLine,
  UsersIcon
} from 'lucide-react';
```

Add a new entry to the `tabs` array, after `'/insights'`:

```ts
const tabs = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/session',   label: 'Plan', Icon: DumbbellIcon },
  { href: '/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/insights',  label: 'Insights', Icon: ChartLine },
  { href: '/social',    label: 'Social', Icon: UsersIcon },
];
```

- [ ] **Step 2: Tighten spacing so 5 tabs fit the pill nav**

In the same file, reduce the per-tab horizontal padding so the pill doesn't overflow narrow screens — change the `Link` className's `px-3` to `px-2`:

```tsx
              'relative flex flex-col items-center rounded-full px-2 py-2 text-xs transition-colors',
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the dashboard on a phone-width viewport (browser devtools device toolbar, e.g. 390px). Confirm all 5 tabs plus the profile icon fit without wrapping or overflowing, and tapping "Social" navigates to `/social` with the tab correctly highlighted.

- [ ] **Step 5: Commit**

```bash
git add components/BottomNav.tsx
git commit -m "feat: add Social tab to bottom navigation"
```

---

## Self-Review Notes

- **Spec coverage:** Data model → Tasks 1–2. Username generation & settings → Tasks 1, 3, 4. Friend request flow (search/send/list/accept/decline) → Tasks 5–7. Leaderboard computation → Task 9. UI (search + requests + leaderboard + friends list) → Tasks 10–11. Nav placement → Task 12. All spec sections are covered.
- **Placeholder scan:** No TBD/TODO markers; every step has complete, pasteable code or an exact command with expected output.
- **Type consistency:** `LeaderboardEntry`/`Friend` shapes in `FriendsLeaderboard.tsx` (Task 11) match the JSON shapes returned by `/api/social/leaderboard` (Task 9) and `/api/social/friends` (Task 8) field-for-field (`profileId`, `username`, `firstName`, `avatarUrl`, `level`, `value`, `rank`, `isSelf` / `friendshipId`, `profileId`, `username`, `firstName`). `IncomingRequest` in `FriendRequests.tsx` (Task 10) matches the `incoming` shape from Task 6's `GET /api/social/requests`. `computeLevel`/`computeConsistencyWeek`/`getWeekRange` are imported with the exact names/signatures already exported by `lib/leveling.ts`/`lib/consistency.ts` (verified by reading both files before writing this plan).
- **Note on Task 6's Supabase embed syntax:** the `requester:profiles!friendships_requesterId_fkey(...)` embed relies on Prisma's default FK constraint naming (`<table>_<column>_fkey`). Task 6 Step 3 verifies this against the live DB before relying on it, and gives the fallback (adjust the hint) if the name differs.
