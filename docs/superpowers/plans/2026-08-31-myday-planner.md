# MyDay Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "MyDay" tab to Logbook's dock: a Teams-calendar-style day timeline combining manually-added time blocks with cross-app items (planned workout, meal plan, tasks due today, bills due) that aren't scheduled to a specific time yet, plus a month-grid calendar to jump between days.

**Architecture:** One new Prisma model (`MydayBlock` → `myday_blocks`), keyed by `profileId` exactly like every other table. Cross-app "unscheduled" items are computed on read in `lib/myday/day.ts` (never stored) by querying `workout_plans`, `tasklog_tasks`, and `recurring_items` the same way `lib/logbook/today.ts` already does. API routes follow the exact `app/api/logbook/*` pattern (`createRouteHandlerClient` → `getMyProfileId` via a service-role client → query). UI is four new client components under `components/myday/` plus a page under `app/(logbook)/logbook/myday/`, wired into the existing `LogbookBottomNav`.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma (`db push`, no migrations directory), Supabase (`@supabase/auth-helpers-nextjs`), `date-fns`, `useSWR`, existing `components/ui/*` (Drawer, Dialog, Button, Input, Textarea, Label, Skeleton), `lucide-react`. No new dependencies.

## Global Constraints

- No test framework exists in this repo. Verification is `npx tsc --noEmit` + manual in-browser checks (this repo's established convention).
- Schema changes go through `npx prisma db push` (no `prisma/migrations` directory). RLS is applied via the `mcp__supabase__apply_migration` tool (live Supabase MCP access is available this session) — `supabase/rls.sql` is also updated as the version-controlled source of truth, per this repo's existing convention (see `docs/superpowers/plans/2026-08-22-lifelog-core-features.md`).
- Every new table's Supabase access must go through `profileId`, resolved via `profiles.userId = auth.uid()`, matching every existing table.
- API routes follow the `app/api/logbook/today/route.ts` pattern exactly: `createRouteHandlerClient({ cookies })` for the auth check, then a `createServiceRoleClient()` + `getMyProfileId()` for the actual data query.
- Dynamic API route params are `Promise`-typed in this Next.js version (`{ params }: { params: Promise<{ id: string }> }`, `const { id } = await params`) — confirmed in `app/api/shoppinglog/favorites/[id]/route.ts`.
- Client components using `useSearchParams()` must be wrapped in `<Suspense>` from a server-component `page.tsx` — confirmed convention in `app/ai-setup/page.tsx` + `app/ai-setup/_components/AiSetupFlow.tsx`.
- No drag-to-reschedule/resize, no plan-vs-actual for bills/meals, no recurring/templated day plans — all explicitly out of scope per the design spec.

---

### Task 1: Data model — `myday_blocks` table, RLS, shared types

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`
- Create: `lib/myday/types.ts`

**Interfaces:**
- Produces (used by every later task): DB table `myday_blocks` (columns: `id`, `profileId`, `date`, `title`, `notes`, `startTime`, `endTime`, `source`, `sourceId`, `completed`, `createdAt`), RLS-protected identically to `tasklog_tasks`. `MyDayBlock`, `MyDayUnscheduledItem`, `MyDayData` types from `lib/myday/types.ts`.

- [ ] **Step 1: Add the `MydayBlock` model to `prisma/schema.prisma`**

Insert this new model immediately after the `model Task { ... }` block ends (the `}` that closes it, right before the `/// a raw idea captured before it's broken into tasks` comment):

```prisma
/// a single time-boxed item on a user's day plan — either typed in
/// directly, or created from an unscheduled cross-app item (planned
/// workout, task due today, bill due) via source/sourceId
model MydayBlock {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile   Profile  @relation(fields: [profileId], references: [id])
  profileId String   @db.Uuid
  date      DateTime @db.Date
  title     String
  notes     String?
  startTime String // 'HH:mm'
  endTime   String // 'HH:mm'
  source    String   @default("manual") // 'manual' | 'burnlog' | 'tasklog' | 'moneylog'
  sourceId  String?  @db.Uuid // links back to the originating row for actual-status lookup
  completed Boolean  @default(false)
  createdAt DateTime @default(now())

  @@map("myday_blocks")
}
```

Then add the back-relation to `model Profile`, on its own line right after `shopReviews             ShopReview[]`:

```prisma
  MydayBlock              MydayBlock[]
```

- [ ] **Step 2: Push the schema change**

Run: `npx prisma db push`
Expected: output confirms the `myday_blocks` table was created, no errors.

- [ ] **Step 3: Apply RLS via the `mcp__supabase__apply_migration` tool**

Call `mcp__supabase__apply_migration` with a `name` like `myday_blocks_rls` and this `query`:

```sql
alter table myday_blocks enable row level security;

create policy "myday_blocks_owner_access" on myday_blocks
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = myday_blocks."profileId"
        and profiles."userId" = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = myday_blocks."profileId"
        and profiles."userId" = auth.uid()
    )
  );
```

Expected: migration applies with no errors.

- [ ] **Step 4: Add `'myday_blocks'` to `supabase/rls.sql`'s tracked table array**

In `supabase/rls.sql`, add `'myday_blocks'` to the end of the `array[...]` list inside the `do $$ ... end $$;` block (after `'tasklog_ideas'`), so a fresh project setup stays in sync with what was just applied live:

```sql
    'tasklog_ideas',
    'myday_blocks'
```

(This changes `'tasklog_ideas'` from the last, un-commaed entry to having a trailing comma, with `'myday_blocks'` becoming the new last entry.)

- [ ] **Step 5: Create `lib/myday/types.ts`**

```ts
// lib/myday/types.ts
export type MyDaySource = 'manual' | 'burnlog' | 'tasklog' | 'moneylog';

export interface MyDayBlock {
  id: string;
  title: string;
  notes: string | null;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  source: MyDaySource;
  sourceId: string | null;
  completed: boolean;
  actual: boolean | null; // null = no actual-status signal for this source
}

export interface MyDayUnscheduledItem {
  key: string; // stable React key, e.g. `tasklog:${id}`
  title: string;
  source: Exclude<MyDaySource, 'manual'>;
  sourceId: string;
  label: string; // e.g. 'Planned workout', 'Task due today', 'Bill due'
}

export interface MyDayData {
  date: string; // 'yyyy-MM-dd'
  blocks: MyDayBlock[];
  unscheduled: MyDayUnscheduledItem[];
}

export interface MyDayCalendarMonth {
  month: string; // 'yyyy-MM'
  daysWithBlocks: string[]; // 'yyyy-MM-dd'
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the Prisma client regenerates automatically on `db push`; if `MydayBlock` isn't recognized, run `npx prisma generate` and re-check).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql lib/myday/types.ts
git commit -m "$(cat <<'EOF'
feat(myday): add myday_blocks table, RLS, and shared types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `lib/myday/day.ts` — per-date aggregation

**Files:**
- Create: `lib/myday/day.ts`

**Interfaces:**
- Consumes: `MyDayBlock`, `MyDayUnscheduledItem`, `MyDayData` from `./types`. `RecurringItemRow` from `@/lib/financePeriods`.
- Produces: `getMyDayForDate(supabase: SupabaseClient, profileId: string, date: string): Promise<MyDayData>`, used by Task 4's `GET /api/myday`.

- [ ] **Step 1: Create `lib/myday/day.ts`**

```ts
// lib/myday/day.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDay, getDate as getDateOfMonth } from 'date-fns';
import type { RecurringItemRow } from '@/lib/financePeriods';
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from './types';

interface MyDayBlockRow {
  id: string;
  title: string;
  notes: string | null;
  startTime: string;
  endTime: string;
  source: string;
  sourceId: string | null;
  completed: boolean;
}

async function computeActual(
  supabase: SupabaseClient,
  profileId: string,
  source: string,
  sourceId: string | null,
  date: string
): Promise<boolean | null> {
  if (!sourceId) return null;

  if (source === 'tasklog') {
    const { data } = await supabase
      .from('tasklog_tasks')
      .select('completedAt')
      .eq('id', sourceId)
      .eq('profileId', profileId)
      .maybeSingle();
    return data ? Boolean(data.completedAt) : null;
  }

  if (source === 'burnlog') {
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('profileId', profileId)
      .gte('date', `${date}T00:00:00`)
      .lt('date', `${date}T23:59:59.999`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  return null;
}

export async function getMyDayForDate(supabase: SupabaseClient, profileId: string, date: string): Promise<MyDayData> {
  const { data: blockRows } = await supabase
    .from('myday_blocks')
    .select('id, title, notes, startTime, endTime, source, sourceId, completed')
    .eq('profileId', profileId)
    .eq('date', date)
    .order('startTime', { ascending: true });

  const rows = (blockRows as MyDayBlockRow[]) || [];
  const blocks: MyDayBlock[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      startTime: row.startTime,
      endTime: row.endTime,
      source: row.source as MyDayBlock['source'],
      sourceId: row.sourceId,
      completed: row.completed,
      actual: await computeActual(supabase, profileId, row.source, row.sourceId, date),
    }))
  );

  const scheduledSourceIds = new Set(rows.filter((r) => r.sourceId).map((r) => r.sourceId as string));

  const target = new Date(`${date}T00:00:00`);
  const dayOfWeek = getDay(target);
  const dayOfMonth = getDateOfMonth(target);

  const unscheduled: MyDayUnscheduledItem[] = [];

  const [workoutPlanRes, taskRes, recurringRes] = await Promise.all([
    supabase.from('workout_plans').select('id, bodyPart').eq('profileId', profileId).eq('dayOfWeek', dayOfWeek),
    supabase
      .from('tasklog_tasks')
      .select('id, title, completedAt')
      .eq('profileId', profileId)
      .or(`dueDate.eq.${date},plannedForToday.eq.true`),
    supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true).eq('type', 'expense'),
  ]);

  for (const plan of (workoutPlanRes.data as { id: string; bodyPart: string }[]) || []) {
    if (scheduledSourceIds.has(plan.id)) continue;
    unscheduled.push({
      key: `burnlog:${plan.id}`,
      title: `${plan.bodyPart} day`,
      source: 'burnlog',
      sourceId: plan.id,
      label: 'Planned workout',
    });
  }

  for (const task of (taskRes.data as { id: string; title: string; completedAt: string | null }[]) || []) {
    if (task.completedAt) continue;
    if (scheduledSourceIds.has(task.id)) continue;
    unscheduled.push({
      key: `tasklog:${task.id}`,
      title: task.title,
      source: 'tasklog',
      sourceId: task.id,
      label: 'Task due today',
    });
  }

  const recurringItems = (recurringRes.data as RecurringItemRow[]) || [];
  for (const item of recurringItems) {
    const isDueToday =
      (item.frequency === 'monthly' && item.dayOfMonth === dayOfMonth) ||
      (item.frequency === 'weekly' && item.dayOfWeek === dayOfWeek) ||
      (item.frequency === 'yearly' && item.dayOfMonth === dayOfMonth);
    if (!isDueToday) continue;
    if (scheduledSourceIds.has(item.id)) continue;
    unscheduled.push({
      key: `moneylog:${item.id}`,
      title: item.label,
      source: 'moneylog',
      sourceId: item.id,
      label: 'Bill due',
    });
  }

  return { date, blocks, unscheduled };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/myday/day.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/myday/day.ts
git commit -m "$(cat <<'EOF'
feat(myday): add per-date aggregation (blocks + unscheduled items)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/myday/calendar.ts` — month dot data

**Files:**
- Create: `lib/myday/calendar.ts`

**Interfaces:**
- Consumes: `MyDayCalendarMonth` from `./types`.
- Produces: `getMyDayCalendarMonth(supabase: SupabaseClient, profileId: string, month: string): Promise<MyDayCalendarMonth>`, used by Task 4's `GET /api/myday/calendar`.

- [ ] **Step 1: Create `lib/myday/calendar.ts`**

```ts
// lib/myday/calendar.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { format as formatDate } from 'date-fns';
import type { MyDayCalendarMonth } from './types';

export async function getMyDayCalendarMonth(
  supabase: SupabaseClient,
  profileId: string,
  month: string
): Promise<MyDayCalendarMonth> {
  const [year, monthNum] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = formatDate(new Date(year, monthNum, 0), 'yyyy-MM-dd'); // last day of month

  const { data } = await supabase
    .from('myday_blocks')
    .select('date')
    .eq('profileId', profileId)
    .gte('date', start)
    .lte('date', end);

  const daysWithBlocks = Array.from(new Set(((data as { date: string }[]) || []).map((r) => r.date)));
  return { month, daysWithBlocks };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/myday/calendar.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/myday/calendar.ts
git commit -m "$(cat <<'EOF'
feat(myday): add month-level calendar dot data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API routes

**Files:**
- Create: `app/api/myday/route.ts`
- Create: `app/api/myday/[id]/route.ts`
- Create: `app/api/myday/calendar/route.ts`

**Interfaces:**
- Consumes: `getMyDayForDate` (Task 2), `getMyDayCalendarMonth` (Task 3), `getMyProfileId` from `@/lib/homelog/serverAuth`, `createServiceRoleClient` from `@/lib/supabase/serviceRole`.
- Produces:
  - `GET /api/myday?date=YYYY-MM-DD` → `200 MyDayData | 400/401/404/500 { error }`
  - `POST /api/myday` (body: `{ date, title, notes?, startTime, endTime, source?, sourceId? }`) → `201 { id } | 400/401/404/500 { error }`
  - `PATCH /api/myday/[id]` (body: any of `{ title?, notes?, startTime?, endTime?, completed? }`) → `200 { ok: true } | 401/404/500 { error }`
  - `DELETE /api/myday/[id]` → `200 { ok: true } | 401/404/500 { error }`
  - `GET /api/myday/calendar?month=YYYY-MM` → `200 MyDayCalendarMonth | 400/401/404/500 { error }`

- [ ] **Step 1: Create `app/api/myday/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getMyDayForDate } from '@/lib/myday/day';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date query param (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const data = await getMyDayForDate(admin, profileId, date);
    return NextResponse.json(data);
  } catch (error) {
    console.error('myday get error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { date, title, notes, startTime, endTime, source, sourceId } = body as {
      date?: string;
      title?: string;
      notes?: string | null;
      startTime?: string;
      endTime?: string;
      source?: string;
      sourceId?: string | null;
    };

    if (!date || !title?.trim() || !startTime || !endTime) {
      return NextResponse.json({ error: 'date, title, startTime, and endTime are required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('myday_blocks')
      .insert([
        {
          profileId,
          date,
          title: title.trim(),
          notes: notes?.trim() || null,
          startTime,
          endTime,
          source: source ?? 'manual',
          sourceId: sourceId ?? null,
        },
      ])
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error('myday post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/myday/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, notes, startTime, endTime, completed } = body as {
      title?: string;
      notes?: string | null;
      startTime?: string;
      endTime?: string;
      completed?: boolean;
    };

    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title.trim();
    if (notes !== undefined) update.notes = notes?.trim() || null;
    if (startTime !== undefined) update.startTime = startTime;
    if (endTime !== undefined) update.endTime = endTime;
    if (completed !== undefined) update.completed = completed;

    const { error } = await admin.from('myday_blocks').update(update).eq('id', id).eq('profileId', profileId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('myday patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { error } = await admin.from('myday_blocks').delete().eq('id', id).eq('profileId', profileId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('myday delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/api/myday/calendar/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId } from '@/lib/homelog/serverAuth';
import { getMyDayCalendarMonth } from '@/lib/myday/calendar';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const profileId = await getMyProfileId(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month query param (YYYY-MM) is required' }, { status: 400 });
    }

    const data = await getMyDayCalendarMonth(admin, profileId, month);
    return NextResponse.json(data);
  } catch (error) {
    console.error('myday calendar error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/api/myday`.

- [ ] **Step 5: Manual verification with curl**

With the dev server running and an `sb-*-auth-token` cookie copied from the browser (same approach as the AI-icons plan's verification step):

```bash
curl -s -X POST http://localhost:3100/api/myday \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste cookie>" \
  -d '{"date":"2026-09-01","title":"Morning run","startTime":"06:30","endTime":"07:15"}'
```
Expected: `201` with `{"id":"<uuid>"}`.

```bash
curl -s "http://localhost:3100/api/myday?date=2026-09-01" -H "Cookie: <paste cookie>"
```
Expected: `200` with `blocks` containing the block just created, `unscheduled` as an array (possibly empty).

```bash
curl -s "http://localhost:3100/api/myday/calendar?month=2026-09" -H "Cookie: <paste cookie>"
```
Expected: `200` with `daysWithBlocks` including `"2026-09-01"`.

- [ ] **Step 6: Commit**

```bash
git add app/api/myday
git commit -m "$(cat <<'EOF'
feat(myday): add /api/myday CRUD and /api/myday/calendar routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `AddBlockSheet` component

**Files:**
- Create: `components/myday/AddBlockSheet.tsx`

**Interfaces:**
- Consumes: `MyDayBlock` from `@/lib/myday/types`. `POST /api/myday`, `PATCH /api/myday/[id]`, `DELETE /api/myday/[id]` from Task 4.
- Produces: `AddBlockSheet({ date, block?, prefillTitle?, prefillSource?, prefillSourceId?, initialStartTime?, onClose, onSaved }): JSX.Element`, used by Task 8's page.

- [ ] **Step 1: Create `components/myday/AddBlockSheet.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import type { MyDayBlock } from '@/lib/myday/types';

interface AddBlockSheetProps {
  date: string;
  block?: MyDayBlock;
  prefillTitle?: string;
  prefillSource?: MyDayBlock['source'];
  prefillSourceId?: string | null;
  initialStartTime?: string;
  onClose: () => void;
  onSaved: () => void;
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const nextHour = (h + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function AddBlockSheet({
  date,
  block,
  prefillTitle,
  prefillSource,
  prefillSourceId,
  initialStartTime,
  onClose,
  onSaved,
}: AddBlockSheetProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(block?.title ?? prefillTitle ?? '');
  const [notes, setNotes] = useState(block?.notes ?? '');
  const [startTime, setStartTime] = useState(block?.startTime ?? initialStartTime ?? '09:00');
  const [endTime, setEndTime] = useState(
    block?.endTime ?? (initialStartTime ? addHour(initialStartTime) : '10:00')
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(block);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a title');
    if (!startTime || !endTime) return setError('Set a start and end time');
    if (endTime <= startTime) return setError('End time must be after start time');

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/myday/${block!.id}` : '/api/myday', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { title: title.trim(), notes: notes.trim() || null, startTime, endTime }
            : {
                date,
                title: title.trim(),
                notes: notes.trim() || null,
                startTime,
                endTime,
                source: prefillSource ?? 'manual',
                sourceId: prefillSourceId ?? null,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      toast({ description: isEdit ? 'Block updated' : 'Block added to your day' });
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!block) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/myday/${block.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ description: 'Block removed' });
      onSaved();
    } catch {
      setError('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isEdit ? 'Edit block' : 'Add to your day'}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="space-y-1">
            <Label htmlFor="myday-title">Title</Label>
            <Input id="myday-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning run" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="myday-start">Start</Label>
              <Input id="myday-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="myday-end">End</Label>
              <Input id="myday-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="myday-notes">Notes</Label>
            <Textarea id="myday-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            {isEdit && (
              <Button type="button" variant="outline" size="icon" onClick={handleDelete} disabled={deleting} aria-label="Delete block">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `AddBlockSheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/myday/AddBlockSheet.tsx
git commit -m "$(cat <<'EOF'
feat(myday): add AddBlockSheet (create/edit/delete a day block)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `DayTimeline` and `UnscheduledTray` components

**Files:**
- Create: `components/myday/DayTimeline.tsx`
- Create: `components/myday/UnscheduledTray.tsx`

**Interfaces:**
- Consumes: `MyDayBlock`, `MyDayUnscheduledItem` from `@/lib/myday/types`.
- Produces: `DayTimeline({ blocks, onBlockClick, onSlotClick }): JSX.Element`, `UnscheduledTray({ items, onSelect }): JSX.Element`, both used by Task 8's page.

- [ ] **Step 1: Create `components/myday/DayTimeline.tsx`**

```tsx
'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyDayBlock } from '@/lib/myday/types';

interface DayTimelineProps {
  blocks: MyDayBlock[];
  onBlockClick: (block: MyDayBlock) => void;
  onSlotClick: (startTime: string) => void;
}

const START_HOUR = 5;
const END_HOUR = 23;
const ROW_HEIGHT_PX = 64;

const SOURCE_COLORS: Record<MyDayBlock['source'], string> = {
  manual: '#64748B',
  burnlog: '#F97316',
  tasklog: '#3B82F6',
  moneylog: '#22C55E',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export function DayTimeline({ blocks, onBlockClick, onSlotClick }: DayTimelineProps) {
  const gridStartMinutes = START_HOUR * 60;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="relative">
      {hours.map((hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onSlotClick(`${String(hour).padStart(2, '0')}:00`)}
          className="flex w-full items-start gap-3 border-t text-left"
          style={{ height: ROW_HEIGHT_PX }}
        >
          <span className="w-12 shrink-0 pt-1 text-xs text-muted-foreground">{formatHourLabel(hour)}</span>
        </button>
      ))}

      <div className="pointer-events-none absolute inset-0 left-14">
        {blocks.map((block) => {
          const top = ((timeToMinutes(block.startTime) - gridStartMinutes) / 60) * ROW_HEIGHT_PX;
          const height = Math.max(
            24,
            ((timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60) * ROW_HEIGHT_PX
          );
          const color = SOURCE_COLORS[block.source];

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onBlockClick(block)}
              className="pointer-events-auto absolute left-0 right-2 rounded-md border-l-4 bg-card p-2 text-left shadow-sm"
              style={{ top, height, borderLeftColor: color }}
            >
              <div className="flex items-center gap-1.5">
                {block.actual !== null &&
                  (block.actual ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  ))}
                <p className={cn('truncate text-xs font-medium', block.completed && 'text-muted-foreground line-through')}>
                  {block.title}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {block.startTime}–{block.endTime}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/myday/UnscheduledTray.tsx`**

```tsx
'use client';

import { Flame, ListChecks, Wallet, type LucideIcon } from 'lucide-react';
import type { MyDayUnscheduledItem } from '@/lib/myday/types';

interface UnscheduledTrayProps {
  items: MyDayUnscheduledItem[];
  onSelect: (item: MyDayUnscheduledItem) => void;
}

const SOURCE_ICON: Record<MyDayUnscheduledItem['source'], LucideIcon> = {
  burnlog: Flame,
  tasklog: ListChecks,
  moneylog: Wallet,
};

export function UnscheduledTray({ items, onSelect }: UnscheduledTrayProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {items.map((item) => {
        const Icon = SOURCE_ICON[item.source];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `DayTimeline.tsx` or `UnscheduledTray.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/myday/DayTimeline.tsx components/myday/UnscheduledTray.tsx
git commit -m "$(cat <<'EOF'
feat(myday): add DayTimeline and UnscheduledTray components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `MyDayCalendarDialog` component

**Files:**
- Create: `components/myday/MyDayCalendarDialog.tsx`

**Interfaces:**
- Consumes: `GET /api/myday/calendar` from Task 4.
- Produces: `MyDayCalendarDialog({ open, onOpenChange, selectedDate, onSelectDate }): JSX.Element`, used by Task 8's page.

- [ ] **Step 1: Create `components/myday/MyDayCalendarDialog.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format as formatDate, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface MyDayCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MyDayCalendarDialog({ open, onOpenChange, selectedDate, onSelectDate }: MyDayCalendarDialogProps) {
  const [cursor, setCursor] = useState(() => new Date(`${selectedDate}T00:00:00`));
  const [daysWithBlocks, setDaysWithBlocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setCursor(new Date(`${selectedDate}T00:00:00`));
  }, [open, selectedDate]);

  const month = formatDate(cursor, 'yyyy-MM');

  useEffect(() => {
    if (!open) return;
    fetch(`/api/myday/calendar?month=${month}`)
      .then((res) => res.json())
      .then((data) => setDaysWithBlocks(new Set(data.daysWithBlocks ?? [])))
      .catch(() => setDaysWithBlocks(new Set()));
  }, [open, month]);

  const weeks = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const days = eachDayOfInterval({ start, end });
    const leadingBlanks: null[] = Array(getDay(start)).fill(null);
    const cells: (Date | null)[] = [...leadingBlanks, ...days];
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <DialogTitle>{formatDate(cursor, 'MMMM yyyy')}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flatMap((week, wi) =>
            week.map((day, di) => {
              if (!day) return <span key={`${wi}-${di}`} />;
              const key = formatDate(day, 'yyyy-MM-dd');
              const hasBlocks = daysWithBlocks.has(key);
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onSelectDate(key);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-full text-sm',
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {formatDate(day, 'd')}
                  {hasBlocks && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `MyDayCalendarDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/myday/MyDayCalendarDialog.tsx
git commit -m "$(cat <<'EOF'
feat(myday): add month-grid calendar dialog with block dots

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: MyDay page + dock tab

**Files:**
- Create: `app/(logbook)/logbook/myday/page.tsx`
- Create: `app/(logbook)/logbook/myday/_components/MyDayClient.tsx`
- Modify: `components/LogbookBottomNav.tsx`

**Interfaces:**
- Consumes: `AddBlockSheet` (Task 5), `DayTimeline`, `UnscheduledTray` (Task 6), `MyDayCalendarDialog` (Task 7), `GET /api/myday` (Task 4), `useCurrentProfile` from `@/lib/useCurrentProfile`, `TopBar` from `@/components/TopBar`.
- Produces: route `/logbook/myday`, reachable from `LogbookBottomNav`'s new "MyDay" tab.

- [ ] **Step 1: Create `app/(logbook)/logbook/myday/_components/MyDayClient.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { format as formatDate, addDays, subDays } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { DayTimeline } from '@/components/myday/DayTimeline';
import { UnscheduledTray } from '@/components/myday/UnscheduledTray';
import { AddBlockSheet } from '@/components/myday/AddBlockSheet';
import { MyDayCalendarDialog } from '@/components/myday/MyDayCalendarDialog';
import type { MyDayBlock, MyDayData, MyDayUnscheduledItem } from '@/lib/myday/types';

function todayKey(): string {
  return formatDate(new Date(), 'yyyy-MM-dd');
}

async function fetchMyDay(date: string): Promise<MyDayData> {
  const res = await fetch(`/api/myday?date=${date}`);
  if (!res.ok) throw new Error('Failed to load MyDay');
  return res.json();
}

type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock };

export function MyDayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') ?? todayKey();
  const { profile } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(profile ? `myday-${date}` : null, () => fetchMyDay(date));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });

  const goToDate = (next: string) => router.push(`/logbook/myday?date=${next}`);

  const dateLabel = useMemo(() => formatDate(new Date(`${date}T00:00:00`), 'EEEE, MMM d'), [date]);

  const closeSheet = () => setSheet({ mode: 'closed' });
  const handleSheetSaved = () => {
    mutate();
    closeSheet();
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar
        title="MyDay"
        actions={
          <>
            <button type="button" onClick={() => setCalendarOpen(true)} aria-label="Open calendar" className="flex items-center justify-center">
              <CalendarDays className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => mutate()} aria-label="Refresh" className="flex items-center justify-center">
              <RefreshCw className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => goToDate(formatDate(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}>
            ←
          </Button>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <Button variant="ghost" size="sm" onClick={() => goToDate(formatDate(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}>
            →
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!isLoading && error && <p className="text-sm text-muted-foreground">Couldn&apos;t load MyDay.</p>}

        {!isLoading && data && (
          <>
            <UnscheduledTray items={data.unscheduled} onSelect={(item) => setSheet({ mode: 'fromUnscheduled', item })} />
            <DayTimeline
              blocks={data.blocks}
              onBlockClick={(block) => setSheet({ mode: 'edit', block })}
              onSlotClick={(startTime) => setSheet({ mode: 'new', startTime })}
            />
          </>
        )}
      </div>

      <Button
        onClick={() => setSheet({ mode: 'new' })}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add to your day"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {sheet.mode === 'new' && (
        <AddBlockSheet date={date} initialStartTime={sheet.startTime} onClose={closeSheet} onSaved={handleSheetSaved} />
      )}
      {sheet.mode === 'fromUnscheduled' && (
        <AddBlockSheet
          date={date}
          prefillTitle={sheet.item.title}
          prefillSource={sheet.item.source}
          prefillSourceId={sheet.item.sourceId}
          onClose={closeSheet}
          onSaved={handleSheetSaved}
        />
      )}
      {sheet.mode === 'edit' && <AddBlockSheet date={date} block={sheet.block} onClose={closeSheet} onSaved={handleSheetSaved} />}

      <MyDayCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} selectedDate={date} onSelectDate={goToDate} />

      <LogbookBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(logbook)/logbook/myday/page.tsx`**

```tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { MyDayClient } from './_components/MyDayClient';

export const metadata: Metadata = { title: 'MyDay - burnlog' };

export default function MyDayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <MyDayClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: Add the MyDay tab to `components/LogbookBottomNav.tsx`**

Replace the full contents of `components/LogbookBottomNav.tsx`:

```tsx
// components/LogbookBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { LogbookMark } from '@/components/LogbookMark';
import { ProfileMenu } from '@/components/ProfileMenu';
import { cn } from '@/lib/utils';

export function LogbookBottomNav() {
  const pathname = usePathname();
  const isHomeActive = pathname === '/logbook';
  const isMyDayActive = pathname.startsWith('/logbook/myday');
  const isProfileActive = pathname === '/profile' || pathname.startsWith('/profile/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      <Link
        href="/logbook"
        aria-label="Logbook"
        aria-current={isHomeActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isHomeActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isHomeActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <LogbookMark size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">Logbook</span>
      </Link>
      <Link
        href="/logbook/myday"
        aria-label="MyDay"
        aria-current={isMyDayActive ? 'page' : undefined}
        className={cn(
          'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
          isMyDayActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {isMyDayActive && <span className="absolute inset-0 rounded-full bg-primary/10" />}
        <CalendarClock size={20} className="relative z-10 mb-0.5" />
        <span className="relative z-10">MyDay</span>
      </Link>
      <ProfileMenu isActive={isProfileActive} />
    </nav>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification in the browser**

With the dev server running (`npm run dev -- --port 3100`):
1. Navigate to `/logbook`. Confirm the dock now shows three tabs: Logbook, MyDay, Profile.
2. Tap "MyDay". Confirm the page loads with today's date shown, an hour-row timeline from 5am–11pm, and (if you created the test block from Task 4's curl step) "Morning run" positioned around 6:30am with the correct height for a 45-minute block.
3. Tap an empty timeline slot (e.g. the 8am row). Confirm `AddBlockSheet` opens with start time pre-filled to `08:00` and end time `09:00`.
4. Fill in a title, save. Confirm the new block appears on the timeline at the right position and a "Block added to your day" toast shows.
5. Tap the block you just created. Confirm the edit sheet opens pre-filled; change the title and save; confirm it updates in place. Then reopen and delete it; confirm it disappears from the timeline.
6. If you have a `tasklog_tasks` row with `dueDate` = today or `plannedForToday = true` and no `completedAt`, confirm it shows as a chip in the Unscheduled tray; tapping it opens the add sheet pre-filled with its title, and saving converts it into a timed block.
7. Tap the calendar icon in the header. Confirm a month grid opens with a dot on days that have blocks (e.g. today, after you added one); tapping another day navigates MyDay to that date and updates the URL's `?date=` param.
8. Use the ←/→ buttons next to the date label to move a day forward/back; confirm the timeline and URL both update.

Expected: all flows work, no console errors, no double-drawer overlay artifacts.

- [ ] **Step 6: Commit**

```bash
git add "app/(logbook)/logbook/myday" components/LogbookBottomNav.tsx
git commit -m "$(cat <<'EOF'
feat(myday): add MyDay page and dock tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** `docs/superpowers/specs/2026-08-31-myday-planner-design.md`'s route/dock section → Task 8; data model section → Task 1; API section → Task 4 (matches every listed endpoint); UI/interactions section → Tasks 5–8 (`DayTimeline`, `UnscheduledTray`, `AddBlockSheet`, `MyDayCalendarDialog` all present with the exact behaviors described — form-only editing, actual-status indicator, month-grid dots from `myday_blocks` only). Out-of-scope items (drag-to-reschedule, bill/meal plan-vs-actual, recurring day templates) are not implemented anywhere in this plan.
- **Placeholder scan:** none — every step gives complete file contents or exact SQL/curl commands.
- **Type consistency:** `MyDayBlock`/`MyDayUnscheduledItem`/`MyDayData`/`MyDayCalendarMonth` (Task 1) are consumed with identical field names and types by `lib/myday/day.ts` (Task 2), `lib/myday/calendar.ts` (Task 3), the API routes (Task 4), and every component (Tasks 5–8) — no renamed fields across tasks. `AddBlockSheet`'s prop names (`prefillTitle`, `prefillSource`, `prefillSourceId`, `initialStartTime`) match exactly how `MyDayClient` invokes it in Task 8.
