# Admin AI Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pick which free OpenRouter model powers text-based AI features and which powers image (vision) AI features, at runtime, from a new modal in the existing admin section of `/profile`.

**Architecture:** New `ai_model_settings` table (one row per slot: `text` / `vision`) read by all 4 existing AI routes via a shared `getModel()` helper, replacing their current `process.env.AI_*` reads. A new `/api/ai/models` route proxies OpenRouter's public model catalog, filtered to free models and split into text/vision lists. A new admin-gated modal (mirroring the existing `OnboardingPageTogglesModal` pattern) lets the admin view and change both slots. This is the first feature in the app with a server-enforced (RLS) admin boundary — everything else today only checks `isAdmin` client-side.

**Tech Stack:** Next.js 15 (App Router), Supabase (`@supabase/auth-helpers-nextjs`), Prisma (schema-only, `prisma db push` — no migrations directory in this repo), `openai` SDK against OpenRouter, `components/ui/*` (Radix-based), Tailwind.

## Global Constraints

- No automated test framework exists in this repo (no jest/vitest in `package.json`). Verification is manual, in-browser, against the dev server (`npm run dev`), plus `npx tsc --noEmit` after every task.
- Schema changes are applied via `npx prisma db push` (no `prisma/migrations` directory). RLS policies are applied by hand via the Supabase SQL editor or the `mcp__supabase__execute_sql` tool, then mirrored into `supabase/rls.sql` for version control (this repo's established convention).
- Follow existing code style: `'use client'` for client components, `createClientComponentClient()` client-side / `createRouteHandlerClient({ cookies })` server-side, manual `useState`/`useEffect`, Tailwind utility classes, `components/ui/*` primitives, direct Supabase reads/writes from client components for simple admin config (matches `OnboardingPageTogglesModal`) rather than adding new CRUD API routes.
- The free-models catalog endpoint (`/api/ai/models`) returns only public OpenRouter catalog data — no auth check needed on it.
- Do not remove the `AI_VISION_MODEL` / `AI_WORKOUT_MODEL` / `AI_TEXT_MODEL` env vars from `.env.example` — they remain valid as the hardcoded fallback defaults inside `getModel()`, just no longer read directly by the 4 routes.

---

### Task 1: `ai_model_settings` table and RLS policy

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `supabase/rls.sql`

**Interfaces:**
- Produces: `AiModelSetting` Prisma model mapped to table `ai_model_settings` (`id`, `slot` unique text, `modelId` text, `updatedAt`). RLS: any authenticated user can `SELECT`; only rows are writable (`INSERT`/`UPDATE`) when the caller's `profiles.isAdmin = true` for the profile matching `auth.uid()`.

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, add after the `StepEntry` model (before `OnboardingPageFlag`):

```prisma
/// admin-configurable AI model selection per capability slot ('text' | 'vision')
model AiModelSetting {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slot      String   @unique
  modelId   String
  updatedAt DateTime @updatedAt

  @@map("ai_model_settings")
}
```

This table has no `profileId` — it's global app config, not per-user, so it does not need a relation on `Profile`.

- [ ] **Step 2: Push the schema**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Apply RLS**

Using the `mcp__supabase__execute_sql` tool (or the Supabase SQL editor), run:

```sql
alter table ai_model_settings enable row level security;

create policy "ai_model_settings_select_any_authenticated" on ai_model_settings
  for select
  using (auth.uid() is not null);

create policy "ai_model_settings_admin_write" on ai_model_settings
  for insert
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

create policy "ai_model_settings_admin_update" on ai_model_settings
  for update
  using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );
```

- [ ] **Step 4: Mirror the policy into `supabase/rls.sql`**

Append a new section at the end of `supabase/rls.sql` (after the `push_subscriptions` section), documenting this as the first admin-only RLS pattern in the file:

```sql

-- ai_model_settings -----------------------------------------------------
-- Global (non-per-user) config: any authenticated user may read it (every
-- AI route needs to resolve the active model regardless of who's calling),
-- but only an admin (profiles.isAdmin = true) may write it. This is the
-- first admin-gated RLS policy in this file — everywhere else "admin" is
-- currently only a client-side UI check.
alter table ai_model_settings enable row level security;

create policy "ai_model_settings_select_any_authenticated" on ai_model_settings
  for select
  using (auth.uid() is not null);

create policy "ai_model_settings_admin_write" on ai_model_settings
  for insert
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );

create policy "ai_model_settings_admin_update" on ai_model_settings
  for update
  using (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles."userId" = auth.uid()
        and profiles."isAdmin" = true
    )
  );
```

- [ ] **Step 5: Verify**

Using `mcp__supabase__execute_sql`, run:
```sql
select tablename, rowsecurity from pg_tables where tablename = 'ai_model_settings';
select policyname from pg_policies where tablename = 'ai_model_settings';
```
Expected: `rowsecurity = true`, and 3 policies listed (`ai_model_settings_select_any_authenticated`, `ai_model_settings_admin_write`, `ai_model_settings_admin_update`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma supabase/rls.sql
git commit -m "feat: add ai_model_settings table with admin-only write RLS"
```

---

### Task 2: `getModel()` helper

**Files:**
- Create: `lib/ai/modelConfig.ts`

**Interfaces:**
- Consumes: a Supabase client (any variant with `.from()` — works with both `createClientComponentClient()` and `createRouteHandlerClient()` instances since they share the same query interface).
- Produces: `getModel(supabase: SupabaseClient, slot: 'text' | 'vision'): Promise<string>` — resolves the current `modelId` for that slot, or a hardcoded default if no row exists yet. Also exports `DEFAULT_MODELS: Record<'text' | 'vision', string>` for reuse by the settings modal (Task 5) to know what to preselect when a slot has no row.

- [ ] **Step 1: Write the helper**

```ts
// lib/ai/modelConfig.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type ModelSlot = 'text' | 'vision';

export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  text: 'openai/gpt-oss-120b:free',
  vision: 'google/gemini-flash-1.5',
};

export async function getModel(supabase: SupabaseClient, slot: ModelSlot): Promise<string> {
  const { data } = await supabase
    .from('ai_model_settings')
    .select('modelId')
    .eq('slot', slot)
    .maybeSingle();

  return data?.modelId || DEFAULT_MODELS[slot];
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/modelConfig.ts
git commit -m "feat: add getModel helper for admin-configurable AI model slots"
```

---

### Task 3: Free-models catalog endpoint

**Files:**
- Create: `app/api/ai/models/route.ts`

**Interfaces:**
- Consumes: `https://openrouter.ai/api/v1/models` (public OpenRouter catalog, no API key needed for this endpoint).
- Produces: `GET /api/ai/models` returning `{ text: { id: string; name: string }[]; vision: { id: string; name: string }[] }` on success (200), or `{ error: string }` (502/500) on failure. Both lists sorted alphabetically by `name`, free models only.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';

type OpenRouterModel = {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

function isFree(model: OpenRouterModel): boolean {
  if (model.id.endsWith(':free')) return true;
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  return prompt === '0' && completion === '0';
}

function isVision(model: OpenRouterModel): boolean {
  return model.architecture?.input_modalities?.includes('image') ?? false;
}

export async function GET() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch model catalog from OpenRouter' }, { status: 502 });
    }

    const body = await res.json();
    const models = (body?.data ?? []) as OpenRouterModel[];

    const free = models.filter(isFree);
    const vision = free
      .filter(isVision)
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const text = free
      .filter((m) => !isVision(m))
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ text, vision });
  } catch (error) {
    console.error('models catalog error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Start the dev server (`npm run dev` if not already running) and run:
```bash
curl -s http://localhost:3000/api/ai/models | head -c 500
```
Expected: JSON with `text` and `vision` arrays, each entry shaped `{"id": "...", "name": "..."}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/models/route.ts
git commit -m "feat: add free-models catalog endpoint split by text/vision"
```

---

### Task 4: Wire the 4 existing AI routes to `getModel()`

**Files:**
- Modify: `app/api/ai/scan-food/route.ts`
- Modify: `app/api/ai/meal-plan/route.ts`
- Modify: `app/api/ai/estimate-workout-calories/route.ts`
- Modify: `lib/ai/openrouter.ts`
- Modify: `app/api/ai/workout-plan/route.ts`

**Interfaces:**
- Consumes: `getModel()` from `lib/ai/modelConfig.ts` (Task 2).
- Produces: all 4 routes resolve their model from `ai_model_settings` at request time instead of `process.env.AI_*`. `generateWorkoutPlan` in `lib/ai/openrouter.ts` gains a required third parameter `model: string` (the caller now resolves and passes it, keeping `lib/ai/openrouter.ts` free of any Supabase dependency).

- [ ] **Step 1: Wire `scan-food`**

In `app/api/ai/scan-food/route.ts`, remove the module-level constant:
```ts
// Vision-capable model — Gemini Flash is fast and cheap for food analysis
const VISION_MODEL = process.env.AI_VISION_MODEL || 'google/gemini-flash-1.5';
```
and add an import:
```ts
import { getModel } from '@/lib/ai/modelConfig';
```
Inside `POST`, right after the existing `if (!user) { ... }` auth check, add:
```ts
    const VISION_MODEL = await getModel(supabase, 'vision');
```
Leave every other line (including `model: VISION_MODEL` in the `client.chat.completions.create` call) unchanged — `VISION_MODEL` is now a local `const` resolved per-request instead of a module-level constant.

- [ ] **Step 2: Wire `meal-plan`**

In `app/api/ai/meal-plan/route.ts`, remove:
```ts
const MODEL = process.env.AI_WORKOUT_MODEL || 'openai/gpt-oss-120b:free';
```
Add the import:
```ts
import { getModel } from '@/lib/ai/modelConfig';
```
Inside `POST`, immediately after the existing `if (!profile) { ... }` check, add:
```ts
    const MODEL = await getModel(supabase, 'text');
```
Leave the rest (including `model: MODEL` in the completion call) unchanged.

- [ ] **Step 3: Wire `estimate-workout-calories`**

In `app/api/ai/estimate-workout-calories/route.ts`, remove:
```ts
const MODEL = process.env.AI_TEXT_MODEL || 'openai/gpt-oss-120b:free';
```
Add the import:
```ts
import { getModel } from '@/lib/ai/modelConfig';
```
Inside `POST`, right after the existing `if (!user) { ... }` auth check, add:
```ts
    const MODEL = await getModel(supabase, 'text');
```
Leave the rest unchanged.

- [ ] **Step 4: Update `generateWorkoutPlan` to accept a model parameter**

In `lib/ai/openrouter.ts`, remove the module-level constant:
```ts
const MODEL = process.env.AI_WORKOUT_MODEL || 'openai/gpt-oss-120b:free';
```
Change the function signature (currently `export async function generateWorkoutPlan(profile: ProfileContext, lifestyle: LifestyleAnswers): Promise<WorkoutPlanEntry[]> {`) to:
```ts
export async function generateWorkoutPlan(
  profile: ProfileContext,
  lifestyle: LifestyleAnswers,
  model: string
): Promise<WorkoutPlanEntry[]> {
```
And change the `client.chat.completions.create` call inside it from `model: MODEL,` to `model,`.

- [ ] **Step 5: Update the caller in `workout-plan/route.ts`**

In `app/api/ai/workout-plan/route.ts`, add the import:
```ts
import { getModel } from '@/lib/ai/modelConfig';
```
Immediately after the existing `if (profileError || !profile) { ... }` block, add:
```ts
    const model = await getModel(supabase, 'text');
```
Then update both call sites from `generateWorkoutPlan(profile, body)` to `generateWorkoutPlan(profile, body, model)` (there are two — the initial attempt and the one retry inside the `catch` block).

- [ ] **Step 6: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors (this will catch it if any `generateWorkoutPlan` call site was missed — the third parameter is required).

With the dev server running, exercise each of the 4 routes through their existing UI (Log Calories → Photo scan for `scan-food`; the Log Workout AI button for `estimate-workout-calories`; the goals page's meal-plan generator for `meal-plan`; the AI setup flow for `workout-plan`) and confirm each still works exactly as before (no `ai_model_settings` rows exist yet, so all 4 should silently fall back to the hardcoded defaults from `DEFAULT_MODELS`).

- [ ] **Step 7: Commit**

```bash
git add app/api/ai/scan-food/route.ts app/api/ai/meal-plan/route.ts app/api/ai/estimate-workout-calories/route.ts lib/ai/openrouter.ts app/api/ai/workout-plan/route.ts
git commit -m "feat: resolve AI model from ai_model_settings instead of env vars"
```

---

### Task 5: Admin model-settings modal

**Files:**
- Create: `app/profile/_components/AiModelSettingsModal.tsx`
- Modify: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `GET /api/ai/models` (Task 3), `DEFAULT_MODELS` from `lib/ai/modelConfig.ts` (Task 2), table `ai_model_settings` directly via Supabase client (Task 1).
- Produces: `AiModelSettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`, matching `OnboardingPageTogglesModal`'s prop shape exactly, rendered and opened the same way from `app/profile/page.tsx`.

- [ ] **Step 1: Write the modal**

```tsx
// app/profile/_components/AiModelSettingsModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { DEFAULT_MODELS, type ModelSlot } from '@/lib/ai/modelConfig';

type CatalogEntry = { id: string; name: string };
type Catalog = { text: CatalogEntry[]; vision: CatalogEntry[] };

type AiModelSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AiModelSettingsModal({ open, onOpenChange }: AiModelSettingsModalProps) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ text: [], vision: [] });
  const [selected, setSelected] = useState<Record<ModelSlot, string>>({ ...DEFAULT_MODELS });
  const [saving, setSaving] = useState<ModelSlot | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [catalogRes, settingsRes] = await Promise.all([
          fetch('/api/ai/models'),
          supabase.from('ai_model_settings').select('slot, modelId'),
        ]);

        const catalogData = await catalogRes.json();
        if (!catalogRes.ok || catalogData.error) {
          throw new Error(catalogData.error ?? 'Failed to load model catalog');
        }
        setCatalog({ text: catalogData.text ?? [], vision: catalogData.vision ?? [] });

        const rows = (settingsRes.data ?? []) as { slot: ModelSlot; modelId: string }[];
        const next = { ...DEFAULT_MODELS };
        for (const row of rows) {
          next[row.slot] = row.modelId;
        }
        setSelected(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, supabase]);

  const handleChange = async (slot: ModelSlot, modelId: string) => {
    setSelected((prev) => ({ ...prev, [slot]: modelId }));
    setSaving(slot);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('ai_model_settings')
        .upsert({ slot, modelId }, { onConflict: 'slot' });
      if (upsertError) throw upsertError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save — you may not have admin access');
    } finally {
      setSaving(null);
    }
  };

  const renderSelect = (slot: ModelSlot, label: string, options: CatalogEntry[]) => (
    <div className="space-y-1">
      <Label htmlFor={`ai-model-${slot}`}>{label}</Label>
      {options.length === 0 ? (
        <select id={`ai-model-${slot}`} disabled className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
          <option>No free models available</option>
        </select>
      ) : (
        <select
          id={`ai-model-${slot}`}
          value={selected[slot]}
          onChange={(e) => handleChange(slot, e.target.value)}
          disabled={saving === slot}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Model Settings</DialogTitle>
        </DialogHeader>
        {loading ? (
          <Loader2 className="animate-spin h-6 w-6 mx-auto" />
        ) : (
          <div className="space-y-4">
            {renderSelect('text', 'Text Model', catalog.text)}
            {renderSelect('vision', 'Image Model', catalog.vision)}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the modal into the profile page**

In `app/profile/page.tsx`:

Add the import next to the existing `OnboardingPageTogglesModal` import (line 11):
```tsx
import { AiModelSettingsModal } from './_components/AiModelSettingsModal';
```

Add a new icon to the existing lucide-react import (line 10) — change:
```tsx
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame, Settings } from 'lucide-react';
```
to:
```tsx
import { Loader2, Info, AlertTriangle, Sparkles, Bell, Flame, Settings, Cpu } from 'lucide-react';
```

Add a new state variable next to `showPageToggles` (line 30):
```tsx
  const [showAiModelSettings, setShowAiModelSettings] = useState(false);
```

Add a new admin-gated card, right after the existing "Onboarding Pages" card (after the closing `)}` that follows line 346):
```tsx
            {profile.isAdmin && (
              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-amber-500" />
                      AI Model Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Admin tool - choose which free OpenRouter model powers text and image AI features.
                    </p>
                    <Button variant="outline" onClick={() => setShowAiModelSettings(true)}>
                      <Cpu className="w-4 h-4 mr-2" />
                      Manage Models
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
```

Add the modal render next to the existing `<OnboardingPageTogglesModal ... />` line (line 360):
```tsx
      <AiModelSettingsModal open={showAiModelSettings} onOpenChange={setShowAiModelSettings} />
```

- [ ] **Step 3: Manual verification**

Run: `npx tsc --noEmit`
Expected: no new type errors.

With the dev server running, log in as the existing admin test account (or set `isAdmin = true` on a test profile via `mcp__supabase__execute_sql` if none exists) and navigate to `/profile`:
1. Confirm a new "AI Model Settings" card appears in the admin section, with a "Manage Models" button.
2. Click it — confirm the modal opens, shows a loading spinner briefly, then two dropdowns ("Text Model", "Image Model") populated with free models, each preselected to the hardcoded default (since no `ai_model_settings` rows exist yet).
3. Change the Text Model selection — confirm no error appears, and re-opening the modal (close, reopen) shows the new selection persisted.
4. Change the Image Model selection — same check.
5. Log in as (or switch to) a non-admin account, open the browser console, and run a direct Supabase upsert against `ai_model_settings` (e.g. via `window.supabase` if exposed, or by temporarily adding a test button) — confirm it fails under RLS. If there's no convenient way to invoke this from the console, instead verify via `mcp__supabase__execute_sql` that the `ai_model_settings_admin_write`/`admin_update` policies correctly restrict on `profiles.isAdmin`, matching Task 1's Step 5 verification.
6. Re-run the 4 AI features (scan-food, meal-plan, estimate-workout-calories, workout-plan) and confirm they now use the newly-selected models (check the outgoing request's `model` field via the Network tab if desired, or check server logs / `console.error` won't show it directly — the simplest check is that the calls still succeed end-to-end).

- [ ] **Step 4: Commit**

```bash
git add app/profile/_components/AiModelSettingsModal.tsx app/profile/page.tsx
git commit -m "feat: add admin AI model settings modal"
```
