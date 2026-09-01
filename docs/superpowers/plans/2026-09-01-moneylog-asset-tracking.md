# MoneyLog Asset / Net Worth Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a MoneyLog user declare real-world assets (bank accounts, investments, cash, debts) and log dated balance updates over time, giving a net-worth figure and trend — fully separate from the payment wallet.

**Architecture:** Two new Prisma models (`Asset`, `AssetBalanceEntry`, the latter a dated snapshot history mirroring the existing `WeightEntry` pattern). Five new API routes under `/api/moneylog/assets*` follow the exact auth pattern already used by `/api/moneylog/pay`. A new `/moneylog/assets` list page (with a net-worth summary and per-asset "Update" action) and `/moneylog/assets/[id]` detail page (history + recharts trend line), plus a `NetWorthCard` on the MoneyLog home page.

**Tech Stack:** Next.js 15 App Router, Supabase (`@supabase/supabase-js` service-role client — no `PrismaClient` at runtime, only `prisma db push` for schema), `recharts` (already used on the Insights page), existing shadcn `Drawer`/`Card`/`Input`/`Select` primitives, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-09-01-moneylog-asset-tracking-design.md`

## Global Constraints

- No test framework exists in this repo. Every task's "test" step is `npx tsc --noEmit -p .` plus a manual verification procedure — do not introduce a test framework.
- Currency is a single implicit currency — `formatCurrency` from `lib/format.ts` is the only formatter to use.
- Every route derives the caller's `profileId` server-side from the authenticated session — never trust a client-supplied profile/owner id. A request for an asset id that doesn't belong to the caller returns `404` (never reveal existence of another user's asset via a `403`).
- Follow the existing API route auth pattern exactly (see `app/api/moneylog/pay/route.ts`): `createClient()` for `auth.getUser()`, `createServiceRoleClient()` for all data access, a local `getMyProfileId(admin, userId)` helper duplicated per route file (this codebase's existing convention — every route file redefines it locally rather than sharing one).
- Balance entry `value` is always stored `>= 0`, even for `category: 'debt'` — the category, not the sign, determines whether an entry adds to or subtracts from net worth.
- This feature has zero interaction with `finance_transactions`, `payments`, or `/api/moneylog/pay` — do not touch those files or tables.

---

### Task 1: Prisma schema — `Asset` + `AssetBalanceEntry`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `assets` table (`id, profileId, name, category, createdAt, archivedAt`); `asset_balance_entries` table (`id, assetId, value, date, notes, createdAt`).

- [ ] **Step 1: Add the two models**

Insert this block into `prisma/schema.prisma` right after the closing `}` of `model Payment { ... }` (currently ends around line 323, just before `model FinancialGoal`):

```prisma
/// a user-declared real-world holding (bank account, investment account, cash, debt) —
/// tracked as a dated history of balance snapshots, not a single overwritten field
model Asset {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile    Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId  String   @db.Uuid
  name       String
  category   String // 'bank' | 'investment' | 'cash' | 'debt' | 'other'
  createdAt  DateTime @default(now())
  archivedAt DateTime?

  balanceEntries AssetBalanceEntry[]

  @@map("assets")
}

/// one dated balance snapshot for an asset — the asset's "current value" is its latest entry
model AssetBalanceEntry {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
  assetId   String   @db.Uuid
  value     Float
  date      DateTime @default(now())
  notes     String?
  createdAt DateTime @default(now())

  @@map("asset_balance_entries")
}
```

- [ ] **Step 2: Add the reverse relation on `Profile`**

Add this line next to the existing `paymentsAsPayee Payment[] @relation("PaymentPayee")` line:

```prisma
  assets Asset[]
```

- [ ] **Step 3: Push the schema and regenerate the client**

```bash
npx prisma db push
npx prisma generate
```

Expected: exits 0, reports the two new tables being created.

- [ ] **Step 4: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(moneylog): add Asset and AssetBalanceEntry models"
```

---

### Task 2: Asset category helpers

**Files:**
- Create: `lib/moneylog/assetCategories.ts`

**Interfaces:**
- Produces: `ASSET_CATEGORIES`, `AssetCategory` type, `assetCategoryLabel(category: string): string`, `isDebtCategory(category: string): boolean` — used by every task from here on.

- [ ] **Step 1: Write the file**

```ts
// lib/moneylog/assetCategories.ts
// Mirrors lib/financeCategories.ts's shape/pattern for the finance transaction categories.

export const ASSET_CATEGORIES = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'debt', label: 'Debt / Loan' },
  { value: 'other', label: 'Other' },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]['value'];

export function isAssetCategory(value: string): value is AssetCategory {
  return ASSET_CATEGORIES.some((c) => c.value === value);
}

export function assetCategoryLabel(category: string): string {
  const match = ASSET_CATEGORIES.find((c) => c.value === category);
  return match?.label ?? category;
}

/** Debt subtracts from net worth; every other category adds to it. */
export function isDebtCategory(category: string): boolean {
  return category === 'debt';
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/moneylog/assetCategories.ts
git commit -m "feat(moneylog): add asset category constants and helpers"
```

---

### Task 3: `GET`/`POST /api/moneylog/assets`

**Files:**
- Create: `app/api/moneylog/assets/route.ts`

**Interfaces:**
- Consumes: `ASSET_CATEGORIES`/`isAssetCategory`/`isDebtCategory` from Task 2.
- Produces:
  - `GET /api/moneylog/assets` → `200 { assets: { id: string; name: string; category: string; value: number; updatedAt: string | null }[]; netWorth: number }`.
  - `POST /api/moneylog/assets` body `{ name: string; category: string; initialValue: number }` → `200 { asset: { id, name, category, value, updatedAt } }` | `400`.
  - This response shape (`assets`, `netWorth`) is what Task 6 (list page) and Task 8 (home page card) both consume.

- [ ] **Step 1: Write the route**

```ts
// app/api/moneylog/assets/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isAssetCategory, isDebtCategory } from '@/lib/moneylog/assetCategories';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

type AssetRow = {
  id: string;
  name: string;
  category: string;
  balanceEntries: { value: number; date: string }[];
};

function latestValue(entries: { value: number; date: string }[]): { value: number; updatedAt: string | null } {
  if (entries.length === 0) return { value: 0, updatedAt: null };
  const latest = entries.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
  return { value: latest.value, updatedAt: latest.date };
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

    const { data: rows, error } = await admin
      .from('assets')
      .select('id, name, category, balanceEntries:asset_balance_entries(value, date)')
      .eq('profileId', meId)
      .is('archivedAt', null)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const assets = ((rows ?? []) as unknown as AssetRow[]).map((row) => {
      const { value, updatedAt } = latestValue(row.balanceEntries);
      return { id: row.id, name: row.name, category: row.category, value, updatedAt };
    });

    const netWorth = assets.reduce(
      (sum, a) => sum + (isDebtCategory(a.category) ? -a.value : a.value),
      0
    );

    return NextResponse.json({ assets, netWorth });
  } catch (error) {
    console.error('moneylog assets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateAssetBody {
  name?: string;
  category?: string;
  initialValue?: number;
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

    const { name, category, initialValue } = (await request.json()) as CreateAssetBody;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!category || !isAssetCategory(category)) {
      return NextResponse.json({ error: 'A valid category is required' }, { status: 400 });
    }
    if (typeof initialValue !== 'number' || !Number.isFinite(initialValue) || initialValue < 0) {
      return NextResponse.json({ error: 'initialValue must be a non-negative number' }, { status: 400 });
    }

    const { data: asset, error: assetError } = await admin
      .from('assets')
      .insert({ profileId: meId, name: name.trim(), category })
      .select('id, name, category')
      .single();
    if (assetError || !asset) {
      return NextResponse.json({ error: assetError?.message ?? 'Failed to create asset' }, { status: 400 });
    }

    const { data: entry, error: entryError } = await admin
      .from('asset_balance_entries')
      .insert({ assetId: asset.id, value: initialValue })
      .select('date')
      .single();
    if (entryError || !entry) {
      return NextResponse.json({ error: entryError?.message ?? 'Failed to record initial balance' }, { status: 400 });
    }

    return NextResponse.json({
      asset: { id: asset.id, name: asset.name, category: asset.category, value: initialValue, updatedAt: entry.date },
    });
  } catch (error) {
    console.error('moneylog assets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Start the dev server. Unauthenticated: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/moneylog/assets` → expect `401`. With a logged-in browser session, open `/api/moneylog/assets` directly → expect `{"assets":[],"netWorth":0}` on a fresh profile.

- [ ] **Step 4: Commit**

```bash
git add app/api/moneylog/assets/route.ts
git commit -m "feat(moneylog): add GET/POST /api/moneylog/assets"
```

---

### Task 4: `PATCH`/`DELETE /api/moneylog/assets/[id]`

**Files:**
- Create: `app/api/moneylog/assets/[id]/route.ts`

**Interfaces:**
- Consumes: `isAssetCategory` from Task 2.
- Produces: `PATCH /api/moneylog/assets/[id]` body `{ name?: string; category?: string }` → `200 { success: true }` | `400` | `404`. `DELETE /api/moneylog/assets/[id]` → `200 { success: true }` | `404`.

- [ ] **Step 1: Write the route**

```ts
// app/api/moneylog/assets/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isAssetCategory } from '@/lib/moneylog/assetCategories';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function loadOwnedAsset(admin: Admin, meId: string, assetId: string) {
  const { data } = await admin.from('assets').select('id, profileId').eq('id', assetId).single();
  if (!data || data.profileId !== meId) return null;
  return data;
}

interface PatchBody {
  name?: string;
  category?: string;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { name, category } = (await request.json()) as PatchBody;
    const update: { name?: string; category?: string } = {};
    if (name !== undefined) {
      if (name.trim().length === 0) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      update.name = name.trim();
    }
    if (category !== undefined) {
      if (!isAssetCategory(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      update.category = category;
    }

    if (Object.keys(update).length > 0) {
      await admin.from('assets').update(update).eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('moneylog asset PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Idempotent: archiving an already-archived asset just re-sets the same field.
    await admin.from('assets').update({ archivedAt: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('moneylog asset DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/moneylog/assets/[id]/route.ts"
git commit -m "feat(moneylog): add PATCH/DELETE /api/moneylog/assets/[id]"
```

---

### Task 5: `GET`/`POST /api/moneylog/assets/[id]/entries`

**Files:**
- Create: `app/api/moneylog/assets/[id]/entries/route.ts`

**Interfaces:**
- Produces: `GET /api/moneylog/assets/[id]/entries` → `200 { entries: { id: string; value: number; date: string; notes: string | null }[] }` (oldest first) | `404`. `POST` body `{ value: number; notes?: string }` → `200 { entry: { id, value, date, notes } }` | `400` | `404`. This is what Task 6's "Update" drawer and Task 7's detail page both call.

- [ ] **Step 1: Write the route**

```ts
// app/api/moneylog/assets/[id]/entries/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function loadOwnedAsset(admin: Admin, meId: string, assetId: string) {
  const { data } = await admin.from('assets').select('id, profileId').eq('id', assetId).single();
  if (!data || data.profileId !== meId) return null;
  return data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { data: entries, error } = await admin
      .from('asset_balance_entries')
      .select('id, value, date, notes')
      .eq('assetId', id)
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ entries: entries ?? [] });
  } catch (error) {
    console.error('moneylog asset entries GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface AddEntryBody {
  value?: number;
  notes?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { value, notes } = (await request.json()) as AddEntryBody;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: 'value must be a non-negative number' }, { status: 400 });
    }

    const { data: entry, error } = await admin
      .from('asset_balance_entries')
      .insert({ assetId: id, value, notes: notes ?? null })
      .select('id, value, date, notes')
      .single();

    if (error || !entry) {
      return NextResponse.json({ error: error?.message ?? 'Failed to record balance' }, { status: 400 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('moneylog asset entries POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/moneylog/assets/[id]/entries/route.ts"
git commit -m "feat(moneylog): add GET/POST /api/moneylog/assets/[id]/entries"
```

---

### Task 6: Assets list page

**Files:**
- Create: `app/(moneylog)/moneylog/assets/page.tsx`
- Create: `app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx`
- Create: `app/(moneylog)/moneylog/assets/_components/AssetListItem.tsx`
- Create: `app/(moneylog)/moneylog/assets/_components/AddAssetDrawer.tsx`
- Create: `app/(moneylog)/moneylog/assets/_components/UpdateBalanceDrawer.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/moneylog/assets` (Task 3), `POST /api/moneylog/assets/[id]/entries` (Task 5), `ASSET_CATEGORIES`/`assetCategoryLabel`/`isDebtCategory` (Task 2).

- [ ] **Step 1: Write `NetWorthSummaryCard`**

```tsx
// app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx
'use client';

import { Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface NetWorthSummaryCardProps {
  netWorth: number;
  assetCount: number;
}

export function NetWorthSummaryCard({ netWorth, assetCount }: NetWorthSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Wallet className="h-4 w-4" />
          Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn('text-3xl font-semibold tabular-nums', netWorth < 0 && 'text-destructive')}>
          {formatCurrency(netWorth)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Across {assetCount} asset{assetCount === 1 ? '' : 's'}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `AssetListItem`**

```tsx
// app/(moneylog)/moneylog/assets/_components/AssetListItem.tsx
'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import { assetCategoryLabel } from '@/lib/moneylog/assetCategories';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface AssetSummary {
  id: string;
  name: string;
  category: string;
  value: number;
  updatedAt: string | null;
}

interface AssetListItemProps {
  asset: AssetSummary;
  onUpdateClick: (asset: AssetSummary) => void;
}

export function AssetListItem({ asset, onUpdateClick }: AssetListItemProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <Link href={`/moneylog/assets/${asset.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium">{asset.name}</p>
          <p className="text-xs text-muted-foreground">{assetCategoryLabel(asset.category)}</p>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(asset.value)}</p>
            {!asset.updatedAt && <p className="text-xs text-muted-foreground">Not yet updated</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => onUpdateClick(asset)}>
            Update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `AddAssetDrawer`**

```tsx
// app/(moneylog)/moneylog/assets/_components/AddAssetDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ASSET_CATEGORIES } from '@/lib/moneylog/assetCategories';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';

interface AddAssetDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddAssetDrawer({ open, onOpenChange, onCreated }: AddAssetDrawerProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('bank');
  const [initialValue, setInitialValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setCategory('bank');
    setInitialValue('');
  };

  const submit = async () => {
    const value = Number(initialValue);
    if (!name.trim() || !Number.isFinite(value) || value < 0) {
      toast({ variant: 'destructive', title: 'Enter a name and a valid starting balance' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/api/moneylog/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, initialValue: value }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Asset added' });
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Asset</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Savings" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="asset-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asset-initial-value">Starting balance</Label>
            <Input
              id="asset-initial-value"
              type="number"
              min="0"
              step="0.01"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Adding…' : 'Add Asset'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Write `UpdateBalanceDrawer`**

```tsx
// app/(moneylog)/moneylog/assets/_components/UpdateBalanceDrawer.tsx
'use client';

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import type { AssetSummary } from './AssetListItem';

interface UpdateBalanceDrawerProps {
  asset: AssetSummary | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function UpdateBalanceDrawer({ asset, onOpenChange, onUpdated }: UpdateBalanceDrawerProps) {
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!asset) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast({ variant: 'destructive', title: 'Enter a valid balance' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(`/api/moneylog/assets/${asset.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: numeric, notes: notes || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ title: 'Balance updated' });
      setValue('');
      setNotes('');
      onOpenChange(false);
      onUpdated();
    }
  };

  return (
    <Drawer open={!!asset} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Update {asset?.name}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-balance">New balance</Label>
            <Input
              id="new-balance"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance-notes">Notes (optional)</Label>
            <Input id="balance-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 5: Write the page**

```tsx
// app/(moneylog)/moneylog/assets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { NetWorthSummaryCard } from './_components/NetWorthSummaryCard';
import { AssetListItem, type AssetSummary } from './_components/AssetListItem';
import { AddAssetDrawer } from './_components/AddAssetDrawer';
import { UpdateBalanceDrawer } from './_components/UpdateBalanceDrawer';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load assets');
  return res.json();
}

export default function AssetsPage() {
  const { data, isLoading, mutate } = useSWR<{ assets: AssetSummary[]; netWorth: number }>(
    '/api/moneylog/assets',
    fetcher
  );
  const [addOpen, setAddOpen] = useState(false);
  const [updating, setUpdating] = useState<AssetSummary | null>(null);

  const assets = data?.assets ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Assets" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (
          <>
            <NetWorthSummaryCard netWorth={data?.netWorth ?? 0} assetCount={assets.length} />
            <div className="space-y-2">
              {assets.map((asset) => (
                <AssetListItem key={asset.id} asset={asset} onUpdateClick={setUpdating} />
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Asset
            </Button>
          </>
        )}
      </main>
      <AddAssetDrawer open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()} />
      <UpdateBalanceDrawer asset={updating} onOpenChange={(open) => !open && setUpdating(null)} onUpdated={() => mutate()} />
      <MoneyLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 6: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint "app/(moneylog)/moneylog/assets/page.tsx" "app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx" "app/(moneylog)/moneylog/assets/_components/AssetListItem.tsx" "app/(moneylog)/moneylog/assets/_components/AddAssetDrawer.tsx" "app/(moneylog)/moneylog/assets/_components/UpdateBalanceDrawer.tsx"
```

Expected: both clean.

- [ ] **Step 7: Manual verification**

With the dev server running and a logged-in session, navigate to `/moneylog/assets`. Confirm: empty state shows net worth ₹0 and no rows; "Add Asset" creates a bank asset with a starting balance and it appears in the list; clicking "Update" on it and entering a new value updates the displayed value and the net worth total recalculates; adding a `debt` category asset causes the net worth total to go down, not up.

- [ ] **Step 8: Commit**

```bash
git add "app/(moneylog)/moneylog/assets/page.tsx" "app/(moneylog)/moneylog/assets/_components"
git commit -m "feat(moneylog): add assets list page with net worth summary"
```

---

### Task 7: Asset detail page (history + trend chart)

**Files:**
- Create: `app/(moneylog)/moneylog/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/moneylog/assets/[id]/entries` (Task 5), `DELETE /api/moneylog/assets/[id]` (Task 4), `assetCategoryLabel` (Task 2).

- [ ] **Step 1: Write the page**

```tsx
// app/(moneylog)/moneylog/assets/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Archive } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';

type Entry = { id: string; value: number; date: string; notes: string | null };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load history');
  return res.json();
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading } = useSWR<{ entries: Entry[] }>(
    `/api/moneylog/assets/${params.id}/entries`,
    fetcher
  );

  const entries = data?.entries ?? [];
  const chartData = entries.map((e) => ({ date: format(new Date(e.date), 'MMM d'), value: e.value }));

  const archive = async () => {
    if (!window.confirm('Archive this asset? Its history is kept but it will leave your asset list.')) return;
    const res = await apiFetch(`/api/moneylog/assets/${params.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: 'Asset archived' });
      router.push('/moneylog/assets');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Asset History"
        actions={
          <Button variant="ghost" size="icon" aria-label="Archive asset" onClick={archive}>
            <Archive className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-8">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No balance history yet.</p>
        )}
        {!isLoading && entries.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Value Over Time</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="value" stroke="var(--primary)" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {[...entries].reverse().map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(entry.date), 'MMM d, yyyy')}</p>
                      {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(entry.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint "app/(moneylog)/moneylog/assets/[id]/page.tsx"
```

Expected: both clean.

- [ ] **Step 3: Manual verification**

From `/moneylog/assets`, tap an asset with at least two balance updates. Confirm the line chart renders with both points, the history list shows newest first, and tapping the archive icon removes it from `/moneylog/assets` while a direct `GET /api/moneylog/assets/[id]/entries` call still returns its history (confirms soft-delete, not hard delete).

- [ ] **Step 4: Commit**

```bash
git add "app/(moneylog)/moneylog/assets/[id]/page.tsx"
git commit -m "feat(moneylog): add asset detail page with trend chart"
```

---

### Task 8: Net worth card on MoneyLog home page

**Files:**
- Create: `app/(moneylog)/moneylog/_components/NetWorthCard.tsx`
- Modify: `app/(moneylog)/moneylog/page.tsx`

**Interfaces:**
- Consumes: `GET /api/moneylog/assets` (Task 3).

- [ ] **Step 1: Write `NetWorthCard`**

```tsx
// app/(moneylog)/moneylog/_components/NetWorthCard.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/apiFetch';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load net worth');
  return res.json();
}

export function NetWorthCard() {
  const { data } = useSWR<{ netWorth: number }>('/api/moneylog/assets', fetcher);

  return (
    <Link href="/moneylog/assets">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Net Worth</p>
              <p className={cn('text-lg font-semibold tabular-nums', (data?.netWorth ?? 0) < 0 && 'text-destructive')}>
                {data ? formatCurrency(data.netWorth) : '—'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Wire it into the MoneyLog home page**

In `app/(moneylog)/moneylog/page.tsx`, add the import next to the `NetSummaryCard` import:

```ts
import { NetWorthCard } from './_components/NetWorthCard';
```

Then render it immediately after `<NetSummaryCard income={data.totalIncome} expense={data.totalExpense} />`:

```tsx
<NetSummaryCard income={data.totalIncome} expense={data.totalExpense} />
<NetWorthCard />
```

- [ ] **Step 3: Verify with typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint "app/(moneylog)/moneylog/_components/NetWorthCard.tsx" "app/(moneylog)/moneylog/page.tsx"
```

Expected: both clean.

- [ ] **Step 4: Manual verification**

Open `/moneylog`. Confirm the Net Worth card appears below the existing Net Balance card, shows the correct total, and tapping it navigates to `/moneylog/assets`.

- [ ] **Step 5: Commit**

```bash
git add "app/(moneylog)/moneylog/_components/NetWorthCard.tsx" "app/(moneylog)/moneylog/page.tsx"
git commit -m "feat(moneylog): add net worth card to MoneyLog home page"
```
