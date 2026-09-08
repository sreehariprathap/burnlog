# Admin-Managed Loading Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload/paste Lottie JSON, preview any animation, and assign one (or none) to each of the 12 apps — including intellog's Siri orb — replacing the hardcoded map in `SwitchLoader.tsx`.

**Architecture:** Two new Postgres tables (`adminlog_lottie_animations`, `adminlog_lottie_assignments`) hold the animation library and per-app assignment, accessed at runtime through Supabase's JS client (never Prisma directly — this repo uses Prisma only for schema/migrations, matching every existing `app/api/**/route.ts`). Two new API route groups — a public authenticated-read side (`/api/loading-animations*`) and an admin CRUD side (`/api/adminlog/loading-animations*`) — mirror the existing `announcements` / `adminlog/banners` split. `AppSwitchLottie` gains a `kind` so it can render either a Lottie player or `<SiriOrb>`. `SwitchLoader` drops its hardcoded map for a small SWR hook. A new admin page at `/adminlog/loading-animations` provides the management UI, added to the existing nav registry.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + `@supabase/supabase-js`), Prisma (schema/migrations only), `lottie-react`, SWR, vitest, Tailwind + shadcn/radix UI components already in the repo.

**Spec:** `docs/superpowers/specs/2026-09-08-admin-loading-animations-design.md`

## Global Constraints

- Runtime data access goes through Supabase's JS client (`createClient()` from `lib/supabase/server.ts` for user-scoped reads, `createServiceRoleClient()` from `lib/supabase/serviceRole.ts` for admin writes that bypass RLS) — never `@prisma/client` at runtime. Prisma is schema-authoring and migrations only.
- Admin routes gate with `requireAdminCaller(supabase)` from `lib/adminlog/testOnboarding.ts`, returning 403 when it resolves `null`.
- Client-side calls use `apiFetch` from `lib/apiFetch.ts`, not raw `fetch`.
- Column names stay camelCase in Postgres (no per-column `@map`); only tables get snake_case via `@map("...")`, matching every existing model in `prisma/schema.prisma`.
- New Prisma models use `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` for UUID primary keys, matching every existing model.
- Max custom animation payload size: 2MB (`JSON.stringify(data).length`).
- The 5 existing files under `public/lottie/*.json` stay on disk and stay served unauthenticated (per the earlier middleware fix in `middleware.ts`) — built-in rows reference them by `filePath`, never duplicate their bytes into Postgres.

---

## File Structure

- `prisma/schema.prisma` — add `LottieAnimation`, `AppLottieAssignment` models.
- `prisma/migrations/<timestamp>_add_loading_animations/migration.sql` — new tables.
- `prisma/seed-loading-animations.js` — one-time idempotent seed (5 built-in rows + Siri orb row + 6 default assignments).
- `app/api/loading-animations/route.ts` — `GET`, public (authenticated), resolved per-app source map.
- `app/api/loading-animations/[id]/route.ts` — `GET`, public (authenticated), raw animation JSON for DB-stored rows.
- `app/api/adminlog/loading-animations/route.ts` — `GET` (list), `POST` (create), admin-only.
- `app/api/adminlog/loading-animations/[id]/route.ts` — `DELETE`, admin-only.
- `app/api/adminlog/loading-animations/assignments/route.ts` — `PUT`, admin-only.
- `components/AppSwitchLottie.tsx` — modify: `path` prop → `src` + `kind`.
- `lib/loadingAnimations.ts` — new: shared types + `useAppSwitchLottie()` SWR hook.
- `components/SwitchLoader.tsx` — modify: drop hardcoded map, use the new hook.
- `lib/adminlog/nav.ts` — modify: add nav entry.
- `app/(adminlog)/adminlog/loading-animations/page.tsx` — new admin page.

---

### Task 1: Prisma schema, migration, and seed script

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_loading_animations/migration.sql` (timestamp = current UTC time, `YYYYMMDDHHMMSS`)
- Create: `prisma/seed-loading-animations.js`

**Interfaces:**
- Produces: tables `adminlog_lottie_animations` (columns: `id`, `name`, `kind`, `isReadOnly`, `filePath`, `data`, `createdByAdminId`, `createdAt`) and `adminlog_lottie_assignments` (columns: `appId`, `animationId`, `updatedAt`, `updatedByAdminId`). Every later task's Supabase queries use exactly these table and column names.

- [ ] **Step 1: Add the two models to `prisma/schema.prisma`**

Append at the end of the file:

```prisma
/// Library of Lottie animations (or the built-in Siri orb) available to
/// assign to an app's loading screen. Built-ins are seeded read-only;
/// admins add custom ones via AdminLog > Loading Animations.
model LottieAnimation {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String
  kind             String   @default("lottie") // 'lottie' | 'siri_orb'
  isReadOnly       Boolean  @default(false)
  filePath         String?  // set only for the 5 built-in files under public/lottie/
  data             Json?    // set only for admin-uploaded/pasted animations
  createdByAdminId String?  @db.Uuid
  createdAt        DateTime @default(now())

  assignments AppLottieAssignment[]

  @@map("adminlog_lottie_animations")
}

/// Which LottieAnimation (if any) each app shows during app-switch.
/// One row per AppId, including 'intellog'.
model AppLottieAssignment {
  appId            String   @id
  animationId      String?  @db.Uuid
  animation        LottieAnimation? @relation(fields: [animationId], references: [id], onDelete: SetNull)
  updatedAt        DateTime @updatedAt
  updatedByAdminId String?  @db.Uuid

  @@map("adminlog_lottie_assignments")
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_loading_animations --create-only`

This creates `prisma/migrations/<timestamp>_add_loading_animations/migration.sql` from the schema diff. Open it and confirm it contains `CREATE TABLE "adminlog_lottie_animations"` and `CREATE TABLE "adminlog_lottie_assignments"` with a foreign key from `adminlog_lottie_assignments.animationId` to `adminlog_lottie_animations.id` with `ON DELETE SET NULL`. If `--create-only` isn't available in the installed Prisma version, run `npx prisma migrate dev --name add_loading_animations` directly (it applies immediately, which is fine here).

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev`
Expected: migration applies cleanly, `Prisma Client` regenerates with no errors.

- [ ] **Step 4: Write the seed script**

Create `prisma/seed-loading-animations.js`:

```js
// prisma/seed-loading-animations.js
//
// One-time, idempotent seed: registers the 5 existing built-in Lottie files
// and the Siri orb as read-only library entries, then assigns each to the
// app it already shows for today (matching SwitchLoader's old hardcoded
// map exactly, so running this migration changes nothing visible until an
// admin acts).
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Fixed UUIDs so re-running this script upserts the same rows instead of
// duplicating them, same idiom as prisma/seed-sociallog.js's PERSONAS.
const BUILT_INS = [
  { id: '22222222-2222-2222-2222-222222222201', name: 'Weightlifting', filePath: '/lottie/burnlog.json', defaultApp: 'burnlog' },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Money', filePath: '/lottie/moneylog.json', defaultApp: 'moneylog' },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Social Media Marketing', filePath: '/lottie/sociallog.json', defaultApp: 'sociallog' },
  { id: '22222222-2222-2222-2222-222222222204', name: 'World Map', filePath: '/lottie/travellog.json', defaultApp: 'travellog' },
  { id: '22222222-2222-2222-2222-222222222205', name: 'Gears & Loading', filePath: '/lottie/adminlog.json', defaultApp: 'adminlog' },
]

const SIRI_ORB_ID = '22222222-2222-2222-2222-222222222206'

async function main() {
  for (const b of BUILT_INS) {
    await prisma.lottieAnimation.upsert({
      where: { id: b.id },
      create: { id: b.id, name: b.name, kind: 'lottie', isReadOnly: true, filePath: b.filePath },
      update: { name: b.name, kind: 'lottie', isReadOnly: true, filePath: b.filePath, data: null },
    })
    await prisma.appLottieAssignment.upsert({
      where: { appId: b.defaultApp },
      create: { appId: b.defaultApp, animationId: b.id },
      update: { animationId: b.id },
    })
  }

  await prisma.lottieAnimation.upsert({
    where: { id: SIRI_ORB_ID },
    create: { id: SIRI_ORB_ID, name: 'Siri Orb (IntelLog default)', kind: 'siri_orb', isReadOnly: true },
    update: { name: 'Siri Orb (IntelLog default)', kind: 'siri_orb', isReadOnly: true, filePath: null, data: null },
  })
  await prisma.appLottieAssignment.upsert({
    where: { appId: 'intellog' },
    create: { appId: 'intellog', animationId: SIRI_ORB_ID },
    update: { animationId: SIRI_ORB_ID },
  })

  console.log('Seeded 5 built-in animations, the Siri orb entry, and 6 default assignments.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 5: Run the seed script and verify**

Run: `npx ts-node --esm prisma/seed-loading-animations.js`
Expected: prints the success message with no errors.

Verify with `mcp__supabase__execute_sql` (or `psql`) against the dev database:
`select "appId", "animationId" from adminlog_lottie_assignments order by "appId";`
Expected: 6 rows — `adminlog`, `burnlog`, `intellog`, `moneylog`, `sociallog`, `travellog` — each with a non-null `animationId`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed-loading-animations.js
git commit -m "feat(db): add loading animation library and per-app assignment tables"
```

---

### Task 2: Public read API — resolved per-app source + raw animation JSON

**Files:**
- Create: `app/api/loading-animations/route.ts`
- Create: `app/api/loading-animations/route.test.ts`
- Create: `app/api/loading-animations/[id]/route.ts`
- Create: `app/api/loading-animations/[id]/route.test.ts`

**Interfaces:**
- Consumes: tables from Task 1 (`adminlog_lottie_animations`, `adminlog_lottie_assignments`); `createClient()` from `@/lib/supabase/server`; `createServiceRoleClient()` from `@/lib/supabase/serviceRole`; `AppId` from `@/lib/appMode`.
- Produces: `GET /api/loading-animations` → `{ animations: Record<string, { src: string; kind: 'lottie' } | { src: null; kind: 'siri_orb' } | null> }` keyed by `AppId`. `GET /api/loading-animations/[id]` → raw JSON body of that row's `data` column, `Content-Type: application/json`, or 404. These exact shapes are what Task 5's `lib/loadingAnimations.ts` consumes.

- [ ] **Step 1: Write the failing tests for `GET /api/loading-animations`**

Create `app/api/loading-animations/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { GET } from './route';

function fakeAuthedSupabase(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user } }) } };
}

// Real Supabase query builders resolve when awaited directly (they
// implement PromiseLike), so `.select()` here returns an already-resolved
// Promise rather than a further chainable object — this route does no
// `.eq()`/filtering on the assignments query, just a plain select.
function fakeServiceRole(assignmentRows: Array<{ appId: string; animationId: string | null; adminlog_lottie_animations: { id: string; kind: string; filePath: string | null } | null }>) {
  return {
    from: (_table: string) => ({
      select: () => Promise.resolve({ data: assignmentRows, error: null }),
    }),
  };
}

describe('GET /api/loading-animations', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase(null));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('resolves a file-backed animation to its static path', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole([
        { appId: 'burnlog', animationId: 'a1', adminlog_lottie_animations: { id: 'a1', kind: 'lottie', filePath: '/lottie/burnlog.json' } },
      ])
    );
    const res = await GET();
    const body = await res.json();
    expect(body.animations.burnlog).toEqual({ src: '/lottie/burnlog.json', kind: 'lottie' });
  });

  it('resolves a DB-stored animation to the by-id route, and siri_orb to a null src', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole([
        { appId: 'watchlog', animationId: 'a2', adminlog_lottie_animations: { id: 'a2', kind: 'lottie', filePath: null } },
        { appId: 'intellog', animationId: 'a3', adminlog_lottie_animations: { id: 'a3', kind: 'siri_orb', filePath: null } },
        { appId: 'homelog', animationId: null, adminlog_lottie_animations: null },
      ])
    );
    const res = await GET();
    const body = await res.json();
    expect(body.animations.watchlog).toEqual({ src: '/api/loading-animations/a2', kind: 'lottie' });
    expect(body.animations.intellog).toEqual({ src: null, kind: 'siri_orb' });
    expect(body.animations.homelog).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/loading-animations/route.test.ts`
Expected: FAIL — `./route` has no exported `GET` yet (file doesn't exist).

- [ ] **Step 3: Implement `app/api/loading-animations/route.ts`**

```ts
// app/api/loading-animations/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Any signed-in user reads the resolved per-app animation source — this is
// what SwitchLoader fetches on every app-switch. AdminLog > Loading
// Animations does the CRUD, at /api/adminlog/loading-animations.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_lottie_assignments')
      .select('appId, animationId, adminlog_lottie_animations(id, kind, filePath)');
    if (error) throw error;

    const animations: Record<string, { src: string; kind: 'lottie' } | { src: null; kind: 'siri_orb' } | null> = {};
    for (const row of data ?? []) {
      const anim = row.adminlog_lottie_animations as { id: string; kind: string; filePath: string | null } | null;
      if (!anim) {
        animations[row.appId] = null;
        continue;
      }
      if (anim.kind === 'siri_orb') {
        animations[row.appId] = { src: null, kind: 'siri_orb' };
      } else {
        animations[row.appId] = {
          src: anim.filePath ?? `/api/loading-animations/${anim.id}`,
          kind: 'lottie',
        };
      }
    }

    return NextResponse.json({ animations });
  } catch (error) {
    console.error('loading-animations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/loading-animations/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing tests for `GET /api/loading-animations/[id]`**

Create `app/api/loading-animations/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { GET } from './route';

function fakeAuthedSupabase(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user } }) } };
}

function fakeServiceRole(row: { data: unknown } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/loading-animations/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase(null));
    const res = await GET(new Request('http://localhost/api/loading-animations/x'), ctx('x'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the row has no data (e.g. missing or a siri_orb row)', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeServiceRole(null));
    const res = await GET(new Request('http://localhost/api/loading-animations/x'), ctx('x'));
    expect(res.status).toBe(404);
  });

  it('streams the animation JSON with the right content type', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAuthedSupabase({ id: 'u1' }));
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeServiceRole({ data: { v: '5.9.6', layers: [] } })
    );
    const res = await GET(new Request('http://localhost/api/loading-animations/a1'), ctx('a1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body).toEqual({ v: '5.9.6', layers: [] });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run app/api/loading-animations/[id]/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 7: Implement `app/api/loading-animations/[id]/route.ts`**

```ts
// app/api/loading-animations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

// Raw JSON for a DB-stored (custom) animation, used as the fetch target for
// lottie-react's `src` in place of a static /lottie/*.json path. File-backed
// built-ins never hit this route — they're fetched from their static path
// directly, which is why this 404s when `data` is null (a siri_orb row, or
// a row that somehow has neither filePath nor data).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createServiceRoleClient();
    const { data: row, error } = await admin
      .from('adminlog_lottie_animations')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!row?.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(row.data);
  } catch (error) {
    console.error('loading-animations/[id] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run app/api/loading-animations/[id]/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add app/api/loading-animations
git commit -m "feat(api): add public read routes for resolved app loading animations"
```

---

### Task 3: Admin API — list/create/delete animations, set assignments

**Files:**
- Create: `app/api/adminlog/loading-animations/route.ts`
- Create: `app/api/adminlog/loading-animations/route.test.ts`
- Create: `app/api/adminlog/loading-animations/[id]/route.ts`
- Create: `app/api/adminlog/loading-animations/[id]/route.test.ts`
- Create: `app/api/adminlog/loading-animations/assignments/route.ts`
- Create: `app/api/adminlog/loading-animations/assignments/route.test.ts`

**Interfaces:**
- Consumes: `requireAdminCaller` from `@/lib/adminlog/testOnboarding`; `createClient` from `@/lib/supabase/server`; `createServiceRoleClient` from `@/lib/supabase/serviceRole`.
- Produces: `GET /api/adminlog/loading-animations` → `{ animations: Array<{ id: string; name: string; kind: 'lottie' | 'siri_orb'; isReadOnly: boolean; filePath: string | null; hasData: boolean }>, assignments: Record<string, string | null> }`. `filePath` is included as-is (it's a short string, unlike `data` which is deliberately omitted to keep the payload light) so the admin page can address a built-in by its static path without guessing. `POST /api/adminlog/loading-animations` → `{ animation: {...same shape as one list entry} }` or 400. `DELETE /api/adminlog/loading-animations/[id]` → `{ success: true }` or 400. `PUT /api/adminlog/loading-animations/assignments` → `{ success: true }`. Task 6's admin page consumes these exact shapes.

- [ ] **Step 1: Write the failing tests for list + create**

Create `app/api/adminlog/loading-animations/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { GET, POST } from './route';

const VALID_LOTTIE = { v: '5.9.6', layers: [{ ty: 4 }] };

describe('GET /api/adminlog/loading-animations', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('lists animations without their data, plus assignments', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (table: string) => {
        if (table === 'adminlog_lottie_animations') {
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'a1', name: 'Weightlifting', kind: 'lottie', isReadOnly: true, filePath: '/lottie/burnlog.json', data: null },
                { id: 'a2', name: 'Custom', kind: 'lottie', isReadOnly: false, filePath: null, data: VALID_LOTTIE },
              ],
              error: null,
            }),
          };
        }
        return {
          select: () => Promise.resolve({
            data: [{ appId: 'burnlog', animationId: 'a1' }, { appId: 'homelog', animationId: null }],
            error: null,
          }),
        };
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(body.animations).toEqual([
      { id: 'a1', name: 'Weightlifting', kind: 'lottie', isReadOnly: true, filePath: '/lottie/burnlog.json', hasData: false },
      { id: 'a2', name: 'Custom', kind: 'lottie', isReadOnly: false, filePath: null, hasData: true },
    ]);
    expect(body.assignments).toEqual({ burnlog: 'a1', homelog: null });
  });
});

describe('POST /api/adminlog/loading-animations', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: VALID_LOTTIE }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects a blank name', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: '  ', data: VALID_LOTTIE }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects data with no layers array', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: { v: '1' } }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects an oversized payload', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const huge = { v: '1', layers: [], padding: 'x'.repeat(3 * 1024 * 1024) };
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'x', data: huge }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('creates a non-read-only lottie animation on valid input', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'new-id', name: row.name, kind: row.kind, isReadOnly: row.isReadOnly, filePath: null, data: row.data },
              error: null,
            }),
          }),
        }),
      }),
    });
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'My animation', data: VALID_LOTTIE }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.animation).toEqual({ id: 'new-id', name: 'My animation', kind: 'lottie', isReadOnly: false, filePath: null, hasData: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/adminlog/loading-animations/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 3: Implement `app/api/adminlog/loading-animations/route.ts`**

```ts
// app/api/adminlog/loading-animations/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

const MAX_ANIMATION_BYTES = 2 * 1024 * 1024;

function toSummary(row: { id: string; name: string; kind: string; isReadOnly: boolean; filePath: string | null; data: unknown }) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as 'lottie' | 'siri_orb',
    isReadOnly: row.isReadOnly,
    filePath: row.filePath,
    hasData: row.data != null,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const [{ data: animRows, error: animError }, { data: assignRows, error: assignError }] = await Promise.all([
      admin.from('adminlog_lottie_animations').select('id, name, kind, isReadOnly, filePath, data'),
      admin.from('adminlog_lottie_assignments').select('appId, animationId'),
    ]);
    if (animError) throw animError;
    if (assignError) throw assignError;

    const assignments: Record<string, string | null> = {};
    for (const row of assignRows ?? []) {
      assignments[row.appId] = row.animationId;
    }

    return NextResponse.json({
      animations: (animRows ?? []).map(toSummary),
      assignments,
    });
  } catch (error) {
    console.error('adminlog loading-animations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { name, data } = (await request.json()) as { name?: string; data?: unknown };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data) || !Array.isArray((data as Record<string, unknown>).layers)) {
      return NextResponse.json({ error: 'data must be a Lottie animation object with a "layers" array' }, { status: 400 });
    }
    const size = JSON.stringify(data).length;
    if (size > MAX_ANIMATION_BYTES) {
      return NextResponse.json({ error: `Animation is too large (${(size / 1024 / 1024).toFixed(1)}MB, max 2MB)` }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: row, error } = await admin
      .from('adminlog_lottie_animations')
      .insert({ name: name.trim(), kind: 'lottie', isReadOnly: false, data, createdByAdminId: caller.id })
      .select('id, name, kind, isReadOnly, filePath, data')
      .single();
    if (error) throw error;

    return NextResponse.json({ animation: toSummary(row) });
  } catch (error) {
    console.error('adminlog loading-animations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/adminlog/loading-animations/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing tests for delete**

Create `app/api/adminlog/loading-animations/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/adminlog/loading-animations/[id]', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when the row is read-only', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { isReadOnly: true }, error: null }),
          }),
        }),
      }),
    });
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(400);
  });

  it('deletes a non-read-only row', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { isReadOnly: false }, error: null }),
          }),
        }),
        delete: () => ({ eq: deleteEq }),
      }),
    });
    const res = await DELETE(new Request('http://localhost'), ctx('a1'));
    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalledWith('id', 'a1');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run app/api/adminlog/loading-animations/[id]/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 7: Implement `app/api/adminlog/loading-animations/[id]/route.ts`**

```ts
// app/api/adminlog/loading-animations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const admin = createServiceRoleClient();

    const { data: row, error: fetchError } = await admin
      .from('adminlog_lottie_animations')
      .select('isReadOnly')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.isReadOnly) {
      return NextResponse.json({ error: 'Built-in animations cannot be deleted' }, { status: 400 });
    }

    const { error } = await admin.from('adminlog_lottie_animations').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('adminlog loading-animations DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run app/api/adminlog/loading-animations/[id]/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Write the failing tests for assignments**

Create `app/api/adminlog/loading-animations/assignments/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { PUT } from './route';

describe('PUT /api/adminlog/loading-animations/assignments', () => {
  it('returns 403 when not an admin', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ appId: 'burnlog', animationId: 'a1' }) });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('rejects a missing appId', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ animationId: 'a1' }) });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('upserts the assignment, allowing a null animationId', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1', userId: 'u1' });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({ upsert }),
    });
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ appId: 'homelog', animationId: null }) });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'homelog', animationId: null, updatedByAdminId: 'p1' }),
      { onConflict: 'appId' }
    );
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run app/api/adminlog/loading-animations/assignments/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 11: Implement `app/api/adminlog/loading-animations/assignments/route.ts`**

```ts
// app/api/adminlog/loading-animations/assignments/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { appId, animationId } = (await request.json()) as { appId?: string; animationId?: string | null };
    if (!appId) {
      return NextResponse.json({ error: 'appId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_lottie_assignments')
      .upsert({ appId, animationId: animationId ?? null, updatedByAdminId: caller.id }, { onConflict: 'appId' });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('adminlog loading-animations assignments PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run app/api/adminlog/loading-animations/assignments/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 13: Run the full API test suite for this feature**

Run: `npx vitest run app/api/loading-animations app/api/adminlog/loading-animations`
Expected: all 18 tests pass.

- [ ] **Step 14: Commit**

```bash
git add app/api/adminlog/loading-animations
git commit -m "feat(api): add admin CRUD routes for the loading animation library"
```

---

### Task 4: `AppSwitchLottie` gains `kind` (Siri orb support)

**Files:**
- Modify: `components/AppSwitchLottie.tsx`

**Interfaces:**
- Consumes: `SiriOrb` (default export) from `@/components/smoothui/siri-orb`; `Lottie` from `lottie-react`.
- Produces: `AppSwitchLottie({ src, kind }: { src: string | object; kind?: 'lottie' | 'siri_orb' })` — `kind` defaults to `'lottie'`. Tasks 5 and 6 both render this component with these exact prop names.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `components/AppSwitchLottie.tsx`:

```tsx
// components/AppSwitchLottie.tsx
'use client';

import { Lottie } from 'lottie-react';
import SiriOrb from '@/components/smoothui/siri-orb';

export function AppSwitchLottie({
  src,
  kind = 'lottie',
}: {
  src: string | object;
  kind?: 'lottie' | 'siri_orb';
}) {
  return (
    <div className="w-[140px] h-[140px] flex items-center justify-center">
      {kind === 'siri_orb' ? (
        <SiriOrb state="thinking" size="96px" />
      ) : (
        <Lottie src={src} loop autoplay style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails only on `components/SwitchLoader.tsx` (still passing the old `path` prop) — that's Task 6, not a regression here. Confirm the only new error is in `SwitchLoader.tsx` referencing `path`.

- [ ] **Step 3: Commit**

```bash
git add components/AppSwitchLottie.tsx
git commit -m "feat(ui): let AppSwitchLottie render the Siri orb as a selectable kind"
```

---

### Task 5: `lib/loadingAnimations.ts` — shared types + SWR hook

**Files:**
- Create: `lib/loadingAnimations.ts`
- Modify: `components/SwitchLoader.tsx`

**Interfaces:**
- Consumes: `GET /api/loading-animations` from Task 2; `apiFetch` from `@/lib/apiFetch`; `AppId` from `@/lib/appMode`.
- Produces: `type AppLoadingAnimationSrc = { src: string; kind: 'lottie' } | { src: null; kind: 'siri_orb' } | null`; `useAppSwitchLottie(): Partial<Record<AppId, AppLoadingAnimationSrc>>`. Task 6's admin page reuses `AppLoadingAnimationSrc`.

- [ ] **Step 1: Create the hook**

```ts
// lib/loadingAnimations.ts
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import type { AppId } from '@/lib/appMode';

export type AppLoadingAnimationSrc =
  | { src: string; kind: 'lottie' }
  | { src: null; kind: 'siri_orb' }
  | null;

async function fetchLoadingAnimations(): Promise<Partial<Record<AppId, AppLoadingAnimationSrc>>> {
  const res = await apiFetch('/api/loading-animations');
  if (!res.ok) return {};
  const body = await res.json();
  return body.animations ?? {};
}

// Cached globally under SWRConfig (see app/RootLayoutClient.tsx). Assignment
// changes are rare (an admin action), so a long dedupe window and no
// focus-revalidation avoid re-fetching on every app-switch.
export function useAppSwitchLottie(): Partial<Record<AppId, AppLoadingAnimationSrc>> {
  const { data } = useSWR('app-switch-loading-animations', fetchLoadingAnimations, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
  });
  return data ?? {};
}
```

- [ ] **Step 2: Refactor `SwitchLoader.tsx` to use it**

Replace the full contents of `components/SwitchLoader.tsx`:

```tsx
// components/SwitchLoader.tsx
'use client';

import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';
import {
  APP_SWITCH_LOADING_STATES,
  APP_SWITCH_STEP_DURATION_MS,
} from '@/lib/appSwitchLoadingStates';
import { MultiStepLoader } from '@/components/ui/multi-step-loader';
import { AppSwitchLottie } from '@/components/AppSwitchLottie';
import { useAppSwitchLottie } from '@/lib/loadingAnimations';

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();
  const animations = useAppSwitchLottie();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];
  const resolved = animations[switchingTo];
  const icon = resolved ? <AppSwitchLottie src={resolved.src ?? ''} kind={resolved.kind} /> : undefined;

  return (
    <MultiStepLoader
      loading
      duration={APP_SWITCH_STEP_DURATION_MS}
      icon={icon}
      loadingStates={[
        { text: `Switching to ${app.name}…` },
        ...APP_SWITCH_LOADING_STATES[switchingTo],
      ]}
    />
  );
}
```

Note: for `kind: 'siri_orb'`, `resolved.src` is `null` — `AppSwitchLottie` ignores `src` entirely in that branch (see Task 4), so passing `''` as a placeholder is safe and only exists to satisfy the `string | object` prop type.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`), sign in, and trigger an app switch to `burnlog` (or any of the 5 seeded apps) and to `intellog`. Confirm the Lottie animation / Siri orb still renders exactly as before Task 1's migration — the seed script's default assignments should make this a no-op change from the user's perspective.

- [ ] **Step 5: Commit**

```bash
git add lib/loadingAnimations.ts components/SwitchLoader.tsx
git commit -m "feat(ui): resolve app-switch loading icon from the DB instead of a hardcoded map"
```

---

### Task 6: Admin page — library, preview, assignment

**Files:**
- Create: `app/(adminlog)/adminlog/loading-animations/page.tsx`
- Modify: `lib/adminlog/nav.ts`

**Interfaces:**
- Consumes: `GET`/`POST /api/adminlog/loading-animations`, `DELETE /api/adminlog/loading-animations/[id]`, `PUT /api/adminlog/loading-animations/assignments` (Task 3); `AppSwitchLottie` (Task 4); `useRequireAdmin` from `@/lib/adminlog/useRequireAdmin`; `APPS`, `AppId` from `@/lib/appMode`; `apiFetch`; shadcn `Card`, `Button`, `Input`, `Label`, `Textarea`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectGroup`/`SelectLabel`/`SelectItem`, `Badge` from `@/components/ui/*`.
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Add the nav entry**

In `lib/adminlog/nav.ts`, import `Sparkles` is already imported for Micro Interactions — add a distinct icon import. Add `Film` to the `lucide-react` import list (alongside `Settings, Bug, ...`), then add this item to the `ui-themes` category's `items` array, right after the `app-icons` entry:

```ts
{ href: '/adminlog/loading-animations', label: 'Loading Animations', description: 'Manage the Lottie animations shown while switching apps, and assign one to each app.', icon: Film },
```

- [ ] **Step 2: Build the admin page**

Create `app/(adminlog)/adminlog/loading-animations/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Trash2, Lock, Upload } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { APPS, type AppId } from '@/lib/appMode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AppSwitchLottie } from '@/components/AppSwitchLottie';

interface AnimationSummary {
  id: string;
  name: string;
  kind: 'lottie' | 'siri_orb';
  isReadOnly: boolean;
  filePath: string | null;
  hasData: boolean;
}

// Resolves the fetch target for an animation's preview: its static file for
// built-ins, or the by-id DB route for custom ones — same rule Task 2's
// public route applies when resolving an app's assignment.
function srcFor(a: AnimationSummary): string {
  return a.filePath ?? `/api/loading-animations/${a.id}`;
}

interface LibraryResponse {
  animations: AnimationSummary[];
  assignments: Record<string, string | null>;
}

// The unassigned-app sentinel for the assignment <Select> — Radix Select
// item values can't be an empty string, and "None" maps to a null
// animationId in the PUT body.
const NONE_VALUE = '__none__';

async function fetchLibrary(): Promise<LibraryResponse> {
  const res = await apiFetch('/api/adminlog/loading-animations');
  if (!res.ok) throw new Error('Failed to load animations');
  return res.json();
}

const ALL_APP_IDS = Object.keys(APPS) as AppId[];

export default function LoadingAnimationsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { data, isLoading, mutate } = useSWR(profile?.isAdmin ? 'adminlog-loading-animations' : null, fetchLibrary);

  const [name, setName] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonText(await file.text());
    if (!name.trim()) setName(file.name.replace(/\.json$/i, ''));
  }

  async function handleCreate() {
    setFormError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setFormError('That is not valid JSON.');
      return;
    }
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }

    setSaving(true);
    const res = await apiFetch('/api/adminlog/loading-animations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), data: parsed }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Failed to save animation.');
      return;
    }
    setName('');
    setJsonText('');
    mutate();
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/adminlog/loading-animations/${id}`, { method: 'DELETE' });
    mutate();
  }

  async function handleAssign(appId: AppId, animationId: string) {
    const nextId = animationId === NONE_VALUE ? null : animationId;
    // Optimistic update so the <Select> doesn't visually snap back while
    // the request is in flight.
    mutate((current) => current && { ...current, assignments: { ...current.assignments, [appId]: nextId } }, false);
    await apiFetch('/api/adminlog/loading-animations/assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, animationId: nextId }),
    });
    mutate();
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  const animations = data?.animations ?? [];
  const assignments = data?.assignments ?? {};
  const animationsById = new Map(animations.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Manage the animation shown above the checklist while switching apps. Built-in animations are
        read-only; upload or paste your own and assign it to any app, including IntelLog.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Add animation</p>
          <div className="space-y-2">
            <Label htmlFor="anim-name">Name</Label>
            <Input id="anim-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Confetti burst" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anim-file">Upload a .json file</Label>
            <Input id="anim-file" type="file" accept=".json,application/json" onChange={handleFileChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anim-json">…or paste Lottie JSON</Label>
            <Textarea
              id="anim-json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{"v": "5.9.6", "layers": [...]}'
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          {jsonText.trim() && !formError && (
            <div className="flex justify-center py-2">
              <PreviewFromText jsonText={jsonText} />
            </div>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button onClick={handleCreate} disabled={saving || !jsonText.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Upload className="h-4 w-4" /> Save animation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Library</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {animations.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex flex-col items-center gap-2 p-3">
                    <AppSwitchLottie src={srcFor(a)} kind={a.kind} />
                    <p className="text-xs font-medium text-center truncate w-full">{a.name}</p>
                    {a.isReadOnly ? (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Built-in
                      </Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} aria-label={`Delete ${a.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">App assignments</p>
            <div className="space-y-2">
              {ALL_APP_IDS.map((appId) => {
                const currentId = assignments[appId] ?? null;
                const current = currentId ? animationsById.get(currentId) : undefined;
                return (
                  <Card key={appId}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="w-24 shrink-0 text-sm font-medium">{APPS[appId].name}</div>
                      <Select value={currentId ?? NONE_VALUE} onValueChange={(v) => handleAssign(appId, v)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None (text only)</SelectItem>
                          <SelectGroup>
                            <SelectLabel>Built-in</SelectLabel>
                            {animations.filter((a) => a.isReadOnly).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Custom</SelectLabel>
                            {animations.filter((a) => !a.isReadOnly).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <div className="shrink-0">
                        {current ? (
                          <AppSwitchLottie src={srcFor(current)} kind={current.kind} />
                        ) : (
                          <div className="w-[140px] h-[140px]" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewFromText({ jsonText }: { jsonText: string }) {
  let parsed: object | null = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray((parsed as Record<string, unknown>).layers)) return null;
  return <AppSwitchLottie src={parsed} kind="lottie" />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server, sign in as an admin, go to `/adminlog/loading-animations`:
1. Confirm the 5 built-ins and the Siri orb entry appear in the library, each previewing correctly, with a "Built-in" badge and no delete button.
2. Confirm all 12 apps appear in the assignment list with their seeded default selected (5 apps + intellog pre-filled, the rest "None").
3. Paste a small valid Lottie JSON (or upload one of the files under `public/lottie/`), confirm the live preview renders, save it, confirm it appears in the library with a working delete button.
4. Reassign an app (e.g. set `watchlog` to the new custom animation), confirm the row's preview updates immediately.
5. Trigger a real app-switch to `watchlog` and confirm the new animation now shows there.
6. Attempt to paste invalid JSON (e.g. `{not json`) and confirm the inline error appears without a network call succeeding.

- [ ] **Step 5: Commit**

```bash
git add app/(adminlog)/adminlog/loading-animations lib/adminlog/nav.ts
git commit -m "feat(admin): add loading animation library and per-app assignment page"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), public API (Task 2), admin API (Task 3), `AppSwitchLottie`/Siri-orb unification (Task 4), `SwitchLoader` refactor (Task 5), admin UI + preview + nav entry (Task 6), error handling (400s/403s/401s covered in Tasks 2–3's tests, client-side inline error in Task 6), testing (vitest for every route, manual verification steps for UI tasks matching this repo's existing convention of no component-test suite).
- **Placeholder scan:** none — every step has real code or a real shell command.
- **Type consistency:** `AppLoadingAnimationSrc` defined once in Task 5, reused as-is in Task 6's `current`/preview logic. `AnimationSummary` shape in Task 6 matches `toSummary()`'s output in Task 3 exactly (`id, name, kind, isReadOnly, filePath, hasData`), fixed during self-review to carry `filePath` directly instead of a `hasFile` boolean paired with a fragile name-to-path lookup table. `AppSwitchLottie`'s `{ src, kind }` props (Task 4) are used identically in Tasks 5 and 6.
