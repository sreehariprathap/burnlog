# AdminLog Model Gather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AdminLog a filterable browser over OpenRouter's full model catalog, let an admin curate a subset into a new `CuratedModel` table, and make every model picker in the app (the per-feature `Select` dropdowns and IntelLog chat's picker) read from that curated list instead of talking to OpenRouter directly.

**Architecture:** One new Prisma table (`CuratedModel` / `ai_model_catalog`, no RLS — all access via service-role API routes with explicit admin checks, matching this codebase's `intel_chat_threads` convention). `lib/intellog/openrouterModels.ts` is upgraded from a thin `{id,name}` live-fetch to a richer admin-browsing shape (provider/modality/free-paid/context-length). A new `lib/ai/curatedModels.ts` reads the curated table for the two consumption routes. Four new admin API routes (browse the live catalog; list/add/remove curated entries) reuse the existing `requireAdminCaller` helper. One new AdminLog page does the browsing/filtering/curating UI.

**Tech Stack:** Next.js 15 App Router, Prisma + Supabase (service-role client, no RLS on the new table), Vitest for pure-function tests. This codebase has zero route/component tests — routes and pages are verified manually against the dev server.

**Spec:** `docs/superpowers/specs/2026-09-03-model-gather-design.md`

## Global Constraints

- Every new admin API route uses `requireAdminCaller(supabase)` from `lib/adminlog/testOnboarding.ts` (already exists, already used by `app/api/adminlog/test-onboarding/route.ts`) for its admin check — do not write a new inline admin-check block or a new helper.
- No RLS on `ai_model_catalog` — every route touching it uses `createServiceRoleClient()`, never a direct client-side Supabase query.
- `POST /api/adminlog/model-catalog` derives `name`/`provider`/`modality`/`isFree`/`contextLength` itself from the live OpenRouter catalog — it never trusts client-supplied metadata beyond the `modelId` being added.
- Dynamic route params in this Next.js version are `Promise`-wrapped: `{ params }: { params: Promise<{ x: string }> }`, then `const { x } = await params;` (not needed here — the CRUD routes take `modelId` in the request body, not a path param, per the spec).
- Follow existing component/page conventions exactly: `Select`/`Badge`/`Card`/`Label`/`Input` from `@/components/ui/*`, `useRequireAdmin` for admin-gated client pages, the `Suspense`-wrapped `page.tsx` + `_components/XClient.tsx` split for any page using `useSearchParams` (see `app/(logbook)/logbook/myday/page.tsx`).

---

## Task 1: Prisma schema + migration for the curated model catalog

**Files:**
- Modify: `prisma/schema.prisma` (add `CuratedModel` model after `AiModelSetting`, around line 342; add a back-relation field to `Profile`, around line 128)
- Create: `prisma/migrations/20260903220000_add_curated_models/migration.sql`

**Interfaces:**
- Produces: `ai_model_catalog` table (`modelId` unique, `name`, `provider`, `modality`, `isFree`, `contextLength`, `addedByAdminId` → `profiles.id`, `addedAt`). Every later task that reads/writes curated models relies on these exact column names.

- [ ] **Step 1: Add the `CuratedModel` model**

In `prisma/schema.prisma`, insert right after the closing `}` of `model AiModelSetting` (currently ends at line 342):

```prisma

/// an OpenRouter model an admin has curated as available app-wide — the
/// source of truth for every model picker (AdminLog's per-feature Select
/// dropdowns, IntelLog chat's model picker)
model CuratedModel {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  modelId        String   @unique // OpenRouter model id, e.g. "openai/gpt-4o-mini"
  name           String
  provider       String   // parsed from modelId's prefix before "/", e.g. "openai"
  modality       String   // 'text' | 'vision'
  isFree         Boolean
  contextLength  Int?
  addedByAdmin   Profile  @relation("CuratedModelAddedBy", fields: [addedByAdminId], references: [id])
  addedByAdminId String   @db.Uuid
  addedAt        DateTime @default(now())

  @@map("ai_model_catalog")
}
```

- [ ] **Step 2: Add the `Profile` back-relation**

In the `Profile` model, add a line next to the other admin-attribution relations (near `errorLogsResolved`, around line 129):

```prisma
  curatedModelsAdded         CuratedModel[]   @relation("CuratedModelAddedBy")
```

- [ ] **Step 3: Write the migration SQL**

`prisma/migrations/20260903220000_add_curated_models/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "ai_model_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "isFree" BOOLEAN NOT NULL,
    "contextLength" INTEGER,
    "addedByAdminId" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_catalog_modelId_key" ON "ai_model_catalog"("modelId");

-- AddForeignKey
ALTER TABLE "ai_model_catalog" ADD CONSTRAINT "ai_model_catalog_addedByAdminId_fkey" FOREIGN KEY ("addedByAdminId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no validation errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260903220000_add_curated_models
git commit -m "feat(adminlog): add CuratedModel schema for the model catalog"
```

---

## Task 2: Extend the OpenRouter live-catalog fetch for admin browsing

**Files:**
- Modify: `lib/intellog/openrouterModels.ts` (full rewrite of its exports — the old `OpenRouterModel`/`mapOpenRouterModels`/`getModelsList` are replaced, not kept alongside, since nothing calls them after Task 6)
- Modify: `lib/intellog/openrouterModels.test.ts` (full rewrite to match)

**Interfaces:**
- Produces: `interface BrowsableOpenRouterModel { id: string; name: string; provider: string; modality: 'text' | 'vision'; isFree: boolean; contextLength: number | null }`, `mapBrowsableModels(raw: unknown): BrowsableOpenRouterModel[]`, `getBrowsableModelsList(fetchImpl?: typeof fetch, now?: () => number): Promise<BrowsableOpenRouterModel[]>`, `__resetModelsCacheForTests(): void`. Used by the admin browse route (Task 4) and, indirectly, by the curated-add route (Task 5, to derive metadata).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/intellog/openrouterModels.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapBrowsableModels, getBrowsableModelsList, __resetModelsCacheForTests } from './openrouterModels';

function rawModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o-mini',
    context_length: 128000,
    architecture: { input_modalities: ['text'] },
    pricing: { prompt: '0.00000015', completion: '0.0000006' },
    ...overrides,
  };
}

describe('mapBrowsableModels', () => {
  it('maps id/name/provider/modality/isFree/contextLength from the OpenRouter shape', () => {
    const raw = { data: [rawModel()] };
    expect(mapBrowsableModels(raw)).toEqual([
      {
        id: 'openai/gpt-4o-mini',
        name: 'OpenAI: GPT-4o-mini',
        provider: 'openai',
        modality: 'text',
        isFree: false,
        contextLength: 128000,
      },
    ]);
  });

  it('sorts alphabetically by name', () => {
    const raw = { data: [rawModel({ id: 'z/z', name: 'Zeta' }), rawModel({ id: 'a/a', name: 'Alpha' })] };
    expect(mapBrowsableModels(raw).map((m) => m.id)).toEqual(['a/a', 'z/z']);
  });

  it('falls back to id as the name when name is missing or blank', () => {
    const raw = { data: [rawModel({ name: undefined }), rawModel({ id: 'other/model', name: '  ' })] };
    expect(mapBrowsableModels(raw).map((m) => m.name)).toEqual(['openai/gpt-4o-mini', 'other/model']);
  });

  it('derives provider from the id prefix before "/", or "unknown" when there is none', () => {
    const raw = { data: [rawModel({ id: 'anthropic/claude-fable-5' }), rawModel({ id: 'no-slash-id', name: 'No Slash' })] };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'anthropic/claude-fable-5')?.provider).toBe('anthropic');
    expect(models.find((m) => m.id === 'no-slash-id')?.provider).toBe('unknown');
  });

  it('marks modality "vision" when input_modalities includes "image", else "text"', () => {
    const raw = {
      data: [
        rawModel({ id: 'a/vision', architecture: { input_modalities: ['text', 'image'] } }),
        rawModel({ id: 'a/text', architecture: { input_modalities: ['text'] } }),
        rawModel({ id: 'a/no-arch', architecture: undefined }),
      ],
    };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'a/vision')?.modality).toBe('vision');
    expect(models.find((m) => m.id === 'a/text')?.modality).toBe('text');
    expect(models.find((m) => m.id === 'a/no-arch')?.modality).toBe('text');
  });

  it('marks isFree true when the id ends with ":free" or pricing is all zero', () => {
    const raw = {
      data: [
        rawModel({ id: 'a/free-suffix:free', pricing: { prompt: '0.001', completion: '0.001' } }),
        rawModel({ id: 'a/zero-pricing', pricing: { prompt: '0', completion: '0' } }),
        rawModel({ id: 'a/paid', pricing: { prompt: '0.001', completion: '0.001' } }),
      ],
    };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'a/free-suffix:free')?.isFree).toBe(true);
    expect(models.find((m) => m.id === 'a/zero-pricing')?.isFree).toBe(true);
    expect(models.find((m) => m.id === 'a/paid')?.isFree).toBe(false);
  });

  it('uses context_length when present, else null', () => {
    const raw = { data: [rawModel({ context_length: 32000 }), rawModel({ id: 'a/none', context_length: undefined })] };
    const models = mapBrowsableModels(raw);
    expect(models.find((m) => m.id === 'openai/gpt-4o-mini')?.contextLength).toBe(32000);
    expect(models.find((m) => m.id === 'a/none')?.contextLength).toBeNull();
  });

  it('skips entries with no string id and returns [] for malformed input', () => {
    expect(mapBrowsableModels({ data: [{ name: 'no id' }, null, 42] })).toEqual([]);
    expect(mapBrowsableModels(null)).toEqual([]);
    expect(mapBrowsableModels({})).toEqual([]);
    expect(mapBrowsableModels({ data: 'not an array' })).toEqual([]);
  });
});

describe('getBrowsableModelsList', () => {
  beforeEach(() => {
    __resetModelsCacheForTests();
  });

  it('fetches and returns the mapped list on first call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    const result = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    expect(result).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000);
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 1000 + 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL (1 hour) has elapsed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [rawModel()] }) });
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stale cache when a re-fetch fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [rawModel()] }) })
      .mockRejectedValueOnce(new Error('network down'));
    const first = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    const second = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 60 * 60 * 1000 + 1);
    expect(second).toEqual(first);
  });

  it('returns [] when the first-ever fetch fails (no cache to fall back to)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getBrowsableModelsList(fetchImpl as unknown as typeof fetch, () => 0);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/intellog/openrouterModels.test.ts`
Expected: FAIL — `mapBrowsableModels`/`getBrowsableModelsList` don't exist yet.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `lib/intellog/openrouterModels.ts`:

```ts
// lib/intellog/openrouterModels.ts

export interface BrowsableOpenRouterModel {
  id: string;
  name: string;
  provider: string;
  modality: 'text' | 'vision';
  isFree: boolean;
  contextLength: number | null;
}

interface RawOpenRouterModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown } | null;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
}

function deriveProvider(id: string): string {
  const slashIndex = id.indexOf('/');
  return slashIndex === -1 ? 'unknown' : id.slice(0, slashIndex);
}

function deriveModality(model: RawOpenRouterModel): 'text' | 'vision' {
  const modalities = model.architecture?.input_modalities;
  return Array.isArray(modalities) && modalities.includes('image') ? 'vision' : 'text';
}

function deriveIsFree(id: string, model: RawOpenRouterModel): boolean {
  if (id.endsWith(':free')) return true;
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  return prompt === '0' && completion === '0';
}

/**
 * Shapes OpenRouter's `GET /api/v1/models` response ({ data: [{id, name, ...}] })
 * into the richer per-model shape AdminLog's Model Gather browser filters on.
 * Tolerant of malformed/missing fields since it's fed straight from an
 * external API response.
 */
export function mapBrowsableModels(raw: unknown): BrowsableOpenRouterModel[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { data?: unknown }).data)) {
    return [];
  }

  const models: BrowsableOpenRouterModel[] = [];
  for (const entry of (raw as { data: unknown[] }).data) {
    const model = entry as RawOpenRouterModel | null;
    const id = model?.id;
    if (typeof id !== 'string' || !id) continue;

    const rawName = model?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    const contextLength = typeof model?.context_length === 'number' ? model.context_length : null;

    models.push({
      id,
      name,
      provider: deriveProvider(id),
      modality: deriveModality(model as RawOpenRouterModel),
      isFree: deriveIsFree(id, model as RawOpenRouterModel),
      contextLength,
    });
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { data: BrowsableOpenRouterModel[]; fetchedAt: number } | null = null;

/**
 * Fetches the live OpenRouter model list, cached in-memory for CACHE_TTL_MS
 * so the admin browse route isn't hitting OpenRouter on every open. On a
 * failed fetch, serves the stale cache if one exists, else returns [].
 */
export async function getBrowsableModelsList(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<BrowsableOpenRouterModel[]> {
  if (cache && now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
    const json = await res.json();
    const models = mapBrowsableModels(json);
    cache = { data: models, fetchedAt: now() };
    return models;
  } catch (err) {
    if (cache) return cache.data;
    console.error('getBrowsableModelsList: fetch failed and no cache available', err);
    return [];
  }
}

/** Test-only: clears the module-level cache between test cases. */
export function __resetModelsCacheForTests(): void {
  cache = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/intellog/openrouterModels.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/intellog/openrouterModels.ts lib/intellog/openrouterModels.test.ts
git commit -m "feat(adminlog): extend OpenRouter catalog fetch with provider/modality/pricing"
```

---

## Task 3: Curated-model read helper for consumption routes

**Files:**
- Create: `lib/ai/curatedModels.ts`

**Interfaces:**
- Consumes: `ai_model_catalog` table (Task 1).
- Produces: `interface CuratedModelOption { id: string; name: string; modality: 'text' | 'vision'; isFree: boolean }`, `async function listCuratedModels(admin: SupabaseClient): Promise<CuratedModelOption[]>`. Used by `/api/ai/models` (Task 6), `/api/intellog/chat/models` (Task 7), and imported as a type by the frontend model-picker components (Task 8).

- [ ] **Step 1: Implement**

`lib/ai/curatedModels.ts`:

```ts
// lib/ai/curatedModels.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CuratedModelOption {
  id: string;
  name: string;
  modality: 'text' | 'vision';
  isFree: boolean;
}

/** Reads the admin-curated model list (ai_model_catalog), sorted by name. */
export async function listCuratedModels(admin: SupabaseClient): Promise<CuratedModelOption[]> {
  const { data, error } = await admin
    .from('ai_model_catalog')
    .select('modelId, name, modality, isFree')
    .order('name', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as { modelId: string; name: string; modality: string; isFree: boolean }[]).map((row) => ({
    id: row.modelId,
    name: row.name,
    modality: row.modality as 'text' | 'vision',
    isFree: row.isFree,
  }));
}
```

No test — this is a thin DB-read wrapper with no branching logic, matching this codebase's convention of not testing simple Supabase-query helpers (e.g. `lib/homelog/serverAuth.ts`'s `getMyProfileId`).

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `curatedModels.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/curatedModels.ts
git commit -m "feat(adminlog): add curated-model read helper"
```

---

## Task 4: `GET /api/adminlog/model-catalog/browse`

**Files:**
- Create: `app/api/adminlog/model-catalog/browse/route.ts`

**Interfaces:**
- Consumes: `requireAdminCaller` from `@/lib/adminlog/testOnboarding`, `getBrowsableModelsList` from `@/lib/intellog/openrouterModels` (Task 2).
- Produces: `GET /api/adminlog/model-catalog/browse` → `200 { models: BrowsableOpenRouterModel[] }`, `403 { error: 'Admin access required' }` if not an admin. Used by the Model Gather page (Task 9).

- [ ] **Step 1: Implement**

`app/api/adminlog/model-catalog/browse/route.ts`:

```ts
// app/api/adminlog/model-catalog/browse/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { getBrowsableModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const models = await getBrowsableModelsList();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('model-catalog browse GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

With the dev server running and logged in as an admin, from the browser console:
`fetch('/api/adminlog/model-catalog/browse').then(r => r.json()).then(d => console.log(d.models.length, d.models[0]))`
Expected: a few hundred models, each with `id, name, provider, modality, isFree, contextLength`.

- [ ] **Step 3: Commit**

```bash
git add app/api/adminlog/model-catalog/browse/route.ts
git commit -m "feat(adminlog): add GET /api/adminlog/model-catalog/browse route"
```

---

## Task 5: Curated-model CRUD routes

**Files:**
- Create: `app/api/adminlog/model-catalog/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/adminlog/model-catalog` → `200 { models: CuratedModelRow[] }` where `CuratedModelRow = { id: string; modelId: string; name: string; provider: string; modality: string; isFree: boolean; contextLength: number | null; addedAt: string }`, ordered `addedAt desc`.
  - `POST /api/adminlog/model-catalog` body `{ modelId: string }` → `200 { model: CuratedModelRow }`, or `404 { error: 'Model not found in the OpenRouter catalog' }` if `modelId` isn't in the live catalog.
  - `DELETE /api/adminlog/model-catalog` body `{ modelId: string }` → `200 { ok: true }`.
  All three `403` if not an admin. Used by the Model Gather page (Task 9).

- [ ] **Step 1: Implement**

`app/api/adminlog/model-catalog/route.ts`:

```ts
// app/api/adminlog/model-catalog/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { getBrowsableModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('ai_model_catalog')
      .select('id, modelId, name, provider, modality, isFree, contextLength, addedAt')
      .order('addedAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ models: data ?? [] });
  } catch (error) {
    console.error('model-catalog GET error:', error);
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

    const body = await request.json();
    const { modelId } = body as { modelId?: string };
    if (!modelId) {
      return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
    }

    const catalog = await getBrowsableModelsList();
    const found = catalog.find((m) => m.id === modelId);
    if (!found) {
      return NextResponse.json({ error: 'Model not found in the OpenRouter catalog' }, { status: 404 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('ai_model_catalog')
      .upsert(
        {
          modelId: found.id,
          name: found.name,
          provider: found.provider,
          modality: found.modality,
          isFree: found.isFree,
          contextLength: found.contextLength,
          addedByAdminId: caller.id,
        },
        { onConflict: 'modelId' }
      )
      .select('id, modelId, name, provider, modality, isFree, contextLength, addedAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ model: data });
  } catch (error) {
    console.error('model-catalog POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { modelId } = body as { modelId?: string };
    if (!modelId) {
      return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.from('ai_model_catalog').delete().eq('modelId', modelId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('model-catalog DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

With the dev server running and logged in as an admin:
```js
// Add a model that's definitely in the live catalog:
fetch('/api/adminlog/model-catalog', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ modelId: 'openai/gpt-4o-mini' }),
}).then(r => r.json()).then(console.log)
// -> { model: { id, modelId: "openai/gpt-4o-mini", name, provider: "openai", modality, isFree, contextLength, addedAt } }

fetch('/api/adminlog/model-catalog').then(r => r.json()).then(console.log)
// -> { models: [ that one row ] }

fetch('/api/adminlog/model-catalog', {
  method: 'DELETE', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ modelId: 'openai/gpt-4o-mini' }),
}).then(r => r.json()).then(console.log)
// -> { ok: true }

// Confirm a typo'd id is rejected:
fetch('/api/adminlog/model-catalog', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ modelId: 'not/a-real-model' }),
}).then(r => r.json()).then(console.log)
// -> { error: 'Model not found in the OpenRouter catalog' }, status 404
```

- [ ] **Step 3: Commit**

```bash
git add app/api/adminlog/model-catalog/route.ts
git commit -m "feat(adminlog): add curated model catalog CRUD routes"
```

---

## Task 6: Rewrite `/api/ai/models` to read the curated list

**Files:**
- Modify: `app/api/ai/models/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `listCuratedModels` from `@/lib/ai/curatedModels` (Task 3).
- Produces: `GET /api/ai/models` → `200 { text: {id,name,isFree}[]; vision: {id,name,isFree}[] }`, `401` if not authenticated. Consumed by `/adminlog/ai-models` (Task 10) and `/adminlog/ai-model-test` (Task 11) — same response shape as before, with `isFree` newly added per entry.

- [ ] **Step 1: Replace the file**

`app/api/ai/models/route.ts`:

```ts
// app/api/ai/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { listCuratedModels } from '@/lib/ai/curatedModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const models = await listCuratedModels(admin);

    const toEntry = (m: (typeof models)[number]) => ({ id: m.id, name: m.name, isFree: m.isFree });
    const text = models.filter((m) => m.modality === 'text').map(toEntry);
    const vision = models.filter((m) => m.modality === 'vision').map(toEntry);

    return NextResponse.json({ text, vision });
  } catch (error) {
    console.error('models catalog error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

This drops the previous direct-OpenRouter-fetch/free-only-filter logic entirely (that logic now lives in `mapBrowsableModels`/`deriveIsFree` from Task 2, used only by the admin browse route). It also gains an auth check it didn't have before, since it now reads from our own table via the service-role client rather than proxying OpenRouter's public catalog.

- [ ] **Step 2: Verify manually**

With no curated models yet (before Task 5's manual test leaves any behind — re-run it if needed, or add one now): `fetch('/api/ai/models').then(r => r.json()).then(console.log)` should return `{ text: [...], vision: [...] }` reflecting whatever's currently curated, each entry with `isFree`.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/models/route.ts
git commit -m "feat(adminlog): read /api/ai/models from the curated catalog"
```

---

## Task 7: Rewrite `/api/intellog/chat/models` to read the curated list

**Files:**
- Modify: `app/api/intellog/chat/models/route.ts` (full rewrite)

**Interfaces:**
- Consumes: `listCuratedModels` from `@/lib/ai/curatedModels` (Task 3).
- Produces: `GET /api/intellog/chat/models` → `200 { models: CuratedModelOption[] }`. Consumed by `ChatThreadView` (Task 8).

- [ ] **Step 1: Replace the file**

`app/api/intellog/chat/models/route.ts`:

```ts
// app/api/intellog/chat/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { listCuratedModels } from '@/lib/ai/curatedModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const models = await listCuratedModels(admin);
    return NextResponse.json({ models });
  } catch (error) {
    console.error('intellog chat models GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify manually**

`fetch('/api/intellog/chat/models').then(r => r.json()).then(console.log)` → `{ models: [ {id, name, modality, isFree}, ... ] }` matching whatever's curated.

- [ ] **Step 3: Commit**

```bash
git add app/api/intellog/chat/models/route.ts
git commit -m "feat(adminlog): read /api/intellog/chat/models from the curated catalog"
```

---

## Task 8: Thread `isFree` through the IntelLog chat model picker

**Files:**
- Modify: `components/intellog/IntelChatModelPicker.tsx`
- Modify: `components/intellog/IntelChatPromptBar.tsx`
- Modify: `components/intellog/ChatThreadView.tsx`

**Interfaces:**
- Consumes: `CuratedModelOption` type from `@/lib/ai/curatedModels` (Task 3), replacing the now-admin-only `OpenRouterModel` type from `@/lib/intellog/openrouterModels`.

- [ ] **Step 1: Update `ChatThreadView.tsx`**

Change the import and state type:

```diff
-import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';
+import type { CuratedModelOption } from '@/lib/ai/curatedModels';
```

```diff
-  const [models, setModels] = useState<OpenRouterModel[]>([]);
+  const [models, setModels] = useState<CuratedModelOption[]>([]);
```

- [ ] **Step 2: Update `IntelChatPromptBar.tsx`**

```diff
-import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';
+import type { CuratedModelOption } from '@/lib/ai/curatedModels';

 interface IntelChatPromptBarProps {
-  models: OpenRouterModel[];
+  models: CuratedModelOption[];
```

- [ ] **Step 3: Update `IntelChatModelPicker.tsx`**

Change the import/prop type, and show an isFree badge next to each model's name in the dropdown list:

```diff
-import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';
+import type { CuratedModelOption } from '@/lib/ai/curatedModels';

 interface IntelChatModelPickerProps {
-  models: OpenRouterModel[];
+  models: CuratedModelOption[];
```

In the list-row rendering, change:

```diff
                     <span className="truncate">{m.name}</span>
-                    <span className="truncate text-xs text-muted-foreground">{m.id}</span>
+                    <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
+                      <span className="truncate">{m.id}</span>
+                      <span className="shrink-0">{m.isFree ? 'Free' : 'Paid'}</span>
+                    </span>
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing these three files.

- [ ] **Step 5: Verify manually**

With at least one curated model (from Task 5's manual test) and the dev server running, open `/intellog/chat/new`, open the model picker, confirm the curated model(s) show up with a "Free"/"Paid" tag, and that "Use custom model ID…" still works for anything not curated.

- [ ] **Step 6: Commit**

```bash
git add components/intellog/IntelChatModelPicker.tsx components/intellog/IntelChatPromptBar.tsx components/intellog/ChatThreadView.tsx
git commit -m "feat(adminlog): show free/paid badges in the IntelLog chat model picker"
```

---

## Task 9: AdminLog "Model Gather" page

**Files:**
- Create: `app/(adminlog)/adminlog/model-gather/page.tsx`

**Interfaces:**
- Consumes: `GET /api/adminlog/model-catalog/browse` (Task 4), `GET`/`POST`/`DELETE /api/adminlog/model-catalog` (Task 5), `useRequireAdmin` from `@/lib/adminlog/useRequireAdmin`, `BrowsableOpenRouterModel` type from `@/lib/intellog/openrouterModels`.

- [ ] **Step 1: Implement**

`app/(adminlog)/adminlog/model-gather/page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BrowsableOpenRouterModel } from '@/lib/intellog/openrouterModels';

type PricingFilter = 'all' | 'free' | 'paid';
type ModalityFilter = 'all' | 'text' | 'vision';

type CuratedRow = { modelId: string };

function formatContextLength(n: number | null): string {
  if (n == null) return '—';
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

export default function ModelGatherPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();

  const [browseModels, setBrowseModels] = useState<BrowsableOpenRouterModel[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [curatedIds, setCuratedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [modality, setModality] = useState<ModalityFilter>('all');
  const [provider, setProvider] = useState<string>('all');
  const [pricing, setPricing] = useState<PricingFilter>('all');
  const [minContextK, setMinContextK] = useState('');

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const [browseRes, curatedRes] = await Promise.all([
          fetch('/api/adminlog/model-catalog/browse'),
          fetch('/api/adminlog/model-catalog'),
        ]);
        const browseData = await browseRes.json();
        if (!browseRes.ok || browseData.error) throw new Error(browseData.error ?? 'Failed to load OpenRouter catalog');
        setBrowseModels(browseData.models ?? []);

        const curatedData = await curatedRes.json();
        if (curatedRes.ok) {
          setCuratedIds(new Set((curatedData.models as CuratedRow[]).map((m) => m.modelId)));
        }
      } catch (err) {
        setBrowseError(err instanceof Error ? err.message : 'Failed to load models');
      } finally {
        setBrowseLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  const providers = useMemo(
    () => [...new Set(browseModels.map((m) => m.provider))].sort(),
    [browseModels]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minContext = minContextK.trim() ? Number(minContextK) * 1000 : null;
    return browseModels.filter((m) => {
      if (q && !m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
      if (modality !== 'all' && m.modality !== modality) return false;
      if (provider !== 'all' && m.provider !== provider) return false;
      if (pricing === 'free' && !m.isFree) return false;
      if (pricing === 'paid' && m.isFree) return false;
      if (minContext != null && (m.contextLength == null || m.contextLength < minContext)) return false;
      return true;
    });
  }, [browseModels, search, modality, provider, pricing, minContextK]);

  async function toggleCurated(model: BrowsableOpenRouterModel) {
    const isCurated = curatedIds.has(model.id);
    setPendingIds((prev) => new Set(prev).add(model.id));

    const rollback = new Set(curatedIds);
    setCuratedIds((prev) => {
      const next = new Set(prev);
      if (isCurated) next.delete(model.id);
      else next.add(model.id);
      return next;
    });

    try {
      const res = isCurated
        ? await fetch('/api/adminlog/model-catalog', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: model.id }),
          })
        : await fetch('/api/adminlog/model-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: model.id }),
          });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setCuratedIds(rollback);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(model.id);
        return next;
      });
    }
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Model Gather</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse OpenRouter&rsquo;s full catalog and curate which models are available across the
          app. Curated models show up in every model picker (the per-feature AI mapping below, and
          IntelLog chat).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input
            placeholder="Search name or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={modality} onValueChange={(v) => setModality(v as ModalityFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modalities</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="vision">Vision</SelectItem>
            </SelectContent>
          </Select>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pricing} onValueChange={(v) => setPricing(v as PricingFilter)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Free & paid</SelectItem>
              <SelectItem value="free">Free only</SelectItem>
              <SelectItem value="paid">Paid only</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min context (K)"
            value={minContextK}
            onChange={(e) => setMinContextK(e.target.value)}
            className="w-36"
          />
        </CardContent>
      </Card>

      {browseError && <p className="text-sm text-destructive">{browseError}</p>}

      {browseLoading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} of {browseModels.length} models</p>
          {filtered.map((m) => {
            const isCurated = curatedIds.has(m.id);
            const isPending = pendingIds.has(m.id);
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.id}</p>
                  </div>
                  <Badge variant="secondary">{m.provider}</Badge>
                  <Badge variant="outline">{m.modality}</Badge>
                  <Badge variant={m.isFree ? 'default' : 'secondary'}>{m.isFree ? 'Free' : 'Paid'}</Badge>
                  <Badge variant="outline">{formatContextLength(m.contextLength)}</Badge>
                  <Link
                    href={`/adminlog/ai-model-test?model=${encodeURIComponent(m.id)}`}
                    className="text-xs text-primary underline"
                  >
                    Test speed →
                  </Link>
                  <Button
                    size="sm"
                    variant={isCurated ? 'destructive' : 'default'}
                    disabled={isPending}
                    onClick={() => toggleCurated(m)}
                  >
                    {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : isCurated ? 'Remove' : 'Add'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `model-gather/page.tsx`.

- [ ] **Step 3: Verify manually**

Run the dev server, navigate to `/adminlog/model-gather` as an admin. Confirm: the full catalog loads, the filter bar narrows it (try each filter), a curated model (from earlier manual tests) shows "Remove" and everything else shows "Add", clicking Add/Remove updates immediately and persists across a page reload, and "Test speed →" navigates to the test page (verified fully once Task 11 preselects it).

- [ ] **Step 4: Commit**

```bash
git add "app/(adminlog)/adminlog/model-gather/page.tsx"
git commit -m "feat(adminlog): add Model Gather browse-and-curate page"
```

---

## Task 10: Badge free/paid in the existing AI Model Mapping page

**Files:**
- Modify: `app/(adminlog)/adminlog/ai-models/page.tsx`

**Interfaces:**
- Consumes: the updated `/api/ai/models` response shape (Task 6), which now includes `isFree` per entry.

- [ ] **Step 1: Update the `CatalogEntry` type and rendering**

```diff
-type CatalogEntry = { id: string; name: string };
+type CatalogEntry = { id: string; name: string; isFree: boolean };
```

```diff
-                      <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
+                      <SelectItem key={opt.id} value={opt.id}>
+                        {opt.name} · {opt.isFree ? 'Free' : 'Paid'}
+                      </SelectItem>
```

- [ ] **Step 2: Update the stale description text**

The page's intro paragraph currently says "Pick which free OpenRouter model powers each AI feature." — no longer accurate since curated models can be paid too:

```diff
-          Pick which free OpenRouter model powers each AI feature. Text features default to{' '}
-          {DEFAULT_TEXT_MODEL}; photo/document features default to a free vision-capable model.
+          Pick which OpenRouter model powers each AI feature, from the models curated in{' '}
+          <a href="/adminlog/model-gather" className="underline">Model Gather</a>. Text features
+          default to {DEFAULT_TEXT_MODEL}; photo/document features default to a free
+          vision-capable model.
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `ai-models/page.tsx`.

- [ ] **Step 4: Verify manually**

Navigate to `/adminlog/ai-models`, confirm each Select's options now show "· Free"/"· Paid" and the intro text links to Model Gather.

- [ ] **Step 5: Commit**

```bash
git add "app/(adminlog)/adminlog/ai-models/page.tsx"
git commit -m "feat(adminlog): badge free/paid in the AI Model Mapping page"
```

---

## Task 11: Preselect a model on the AI Model Test page via query param

**Files:**
- Create: `app/(adminlog)/adminlog/ai-model-test/_components/AiModelTestClient.tsx` (the entire current contents of `ai-model-test/page.tsx`, moved here, plus the query-param preselect)
- Modify: `app/(adminlog)/adminlog/ai-model-test/page.tsx` (replaced with a thin `Suspense`-wrapping server component, mirroring `app/(logbook)/logbook/myday/page.tsx`)

**Interfaces:**
- Produces: visiting `/adminlog/ai-model-test?model=<id>` preselects that model in the test page's Select. Consumed by the "Test speed →" link on Model Gather (Task 9).

- [ ] **Step 1: Move the current page into a client component**

Create `app/(adminlog)/adminlog/ai-model-test/_components/AiModelTestClient.tsx` with the exact current contents of `app/(adminlog)/adminlog/ai-model-test/page.tsx` (the whole file you'd get from reading it today — `'use client'`, all imports, the `AiModelTestPage` function body), renamed:

```diff
-export default function AiModelTestPage() {
+export function AiModelTestClient() {
```

Add the query-param import and preselect effect. Add this import alongside the existing ones:

```ts
import { useSearchParams } from 'next/navigation';
```

Add this inside the component, near the top (before the "catalog fetch" `useEffect`):

```ts
  const searchParams = useSearchParams();

  useEffect(() => {
    const fromQuery = searchParams.get('model');
    if (fromQuery) setSelectedModel(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(Runs once on mount; the existing catalog-fetch effect's `setSelectedModel((prev) => prev || text[0].id)` already only fills in a default when nothing's selected yet, so it won't clobber a query-param preselection regardless of which effect resolves first.)

- [ ] **Step 2: Replace `page.tsx` with a thin Suspense wrapper**

`app/(adminlog)/adminlog/ai-model-test/page.tsx`:

```tsx
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AiModelTestClient } from './_components/AiModelTestClient';

export default function AiModelTestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      }
    >
      <AiModelTestClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing either file.

- [ ] **Step 4: Verify manually**

Navigate to `/adminlog/model-gather`, click "Test speed →" on any row, confirm `/adminlog/ai-model-test?model=<id>` loads with that model preselected in the dropdown (not necessarily visible as a labeled option if it's not in the free-text catalog — the value is still used when you click "Run test"). Also visit `/adminlog/ai-model-test` directly (no query param) and confirm it still defaults to the first available model, unchanged from before.

- [ ] **Step 5: Commit**

```bash
git add "app/(adminlog)/adminlog/ai-model-test/page.tsx" "app/(adminlog)/adminlog/ai-model-test/_components/AiModelTestClient.tsx"
git commit -m "feat(adminlog): preselect a model on the AI Model Test page via query param"
```

---

## Task 12: Add Model Gather to the AdminLog dashboard

**Files:**
- Modify: `app/(adminlog)/adminlog/page.tsx`

**Interfaces:** none (static nav entry).

- [ ] **Step 1: Add the section**

In the `SECTIONS` array, insert a new entry (placed right after `'AI Model Mapping'`, since they're related):

```diff
   { href: '/adminlog/ai-models', label: 'AI Model Mapping', description: 'Choose which OpenRouter model powers each AI feature across the app.' },
+  { href: '/adminlog/model-gather', label: 'Model Gather', description: 'Browse OpenRouter\'s full catalog and curate which models are available across the app.' },
   { href: '/adminlog/ai-model-test', label: 'AI Model Test', description: 'Ask a fixed test question to any free model and compare latency, throughput, and response quality.' },
```

- [ ] **Step 2: Verify manually**

Navigate to `/adminlog`, confirm the "Model Gather" card appears and links correctly.

- [ ] **Step 3: Commit**

```bash
git add "app/(adminlog)/adminlog/page.tsx"
git commit -m "feat(adminlog): link Model Gather from the AdminLog dashboard"
```

---

## Task 13: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm run test`
Expected: all tests pass, including the rewritten `openrouterModels.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds, `/adminlog/model-gather` and the API routes all appear in the route list with no errors.

- [ ] **Step 4: Manual end-to-end pass**

With the dev server running as an admin:
1. On `/adminlog/model-gather`, filter to a provider/modality/pricing combination, add two or three models, confirm they show up on `/adminlog/ai-models`'s Select dropdowns (with Free/Paid badges) and on the IntelLog chat model picker at `/intellog/chat/new`.
2. Pick one of the newly curated models in an IntelLog chat and confirm a message sends successfully using it.
3. Remove one of the curated models from Model Gather, confirm it disappears from both pickers, and confirm a thread that already had it selected still works (the stored `modelId` string is untouched, per the spec's "no retroactive validation" decision).
4. Confirm the existing "Use custom model ID…" flow in IntelLog chat still works for a model that was never curated.

- [ ] **Step 5: Final commit (only if any fixes were needed)**

If steps 1-4 required fixes, commit them now with a message describing what was wrong. If everything passed cleanly, there's nothing to commit for this task.
