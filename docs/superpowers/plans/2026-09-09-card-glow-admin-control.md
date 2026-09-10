# Card Glow Admin Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a single Off/Subtle/Vibrant control (global + per-app) that actually reaches every gradient/glow card in the app, and normalize the hardcoded ones onto shared palette tokens.

**Architecture:** Follow the existing `AppThemeSetting` pattern exactly: a Postgres table scoped by `"global"` or `AppId`, an API route, an admin page, and a client "Effect" component that resolves app→global→default and writes CSS custom properties (`--card-glow-opacity`, `--card-glow-blur`, `--card-glow-border`) onto `<html>`. A second small helper (`glowColor`/`glowGradient`) gives hardcoded per-category cards a shared hue palette (`--chart-1..5`) instead of inventing their own hex values. Every migrated card then reads its visuals from these CSS vars/helpers instead of local constants.

**Tech Stack:** Next.js (App Router), React, Tailwind v4 (`<utility>-(--css-var)` arbitrary-property syntax already used in this codebase), SWR, Supabase (Postgres via service-role client), Prisma (schema/migration authoring only — runtime reads/writes go through Supabase, matching every other `adminlog_*` table), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-card-glow-admin-control-design.md`

## Global Constraints

- Presets only — no raw numeric sliders in the admin UI (spec §"Non-goals").
- Scope model is per-app with global fallback, exactly like `AppThemeSetting`/`ButtonThemeSetting` (spec §1).
- Preset → concrete values live in code (`CARD_GLOW_PRESETS`), never stored as raw numbers in the DB (spec §2).
- `app/(logbook)/logbook/morning/page.tsx`'s inline gradient is explicitly out of scope for this pass (spec §Non-goals).
- No new automated tests for pure visual/CSS-only component edits — those tasks verify by manual render per spec §Testing; automated tests are written only for genuinely testable logic (preset resolution, palette cycling, preset validation).

---

### Task 1: `CardGlowSetting` table

**Files:**
- Modify: `prisma/schema.prisma` (add model, near `AppThemeSetting`)
- Create: `prisma/migrations/20260909120000_add_card_glow_settings/migration.sql`

**Interfaces:**
- Produces: Postgres table `adminlog_card_glow_settings` with columns `id text primary key`, `preset text not null default 'subtle'`, `updatedAt timestamp(3) not null`.

- [ ] **Step 1: Add the Prisma model**

Add to `prisma/schema.prisma`, directly below the existing `model AppThemeSetting { ... }` block:

```prisma
/// Admin-controlled gradient/glow intensity for dashboard cards. Same
/// scoping convention as AppThemeSetting — id is "global" or an AppId;
/// an app-level row overrides "global", which overrides the "subtle"
/// hardcoded default (see lib/theme/cardGlow.ts).
model CardGlowSetting {
  id        String   @id // "global" | AppId
  preset    String   @default("subtle") // "off" | "subtle" | "vibrant"
  updatedAt DateTime @updatedAt

  @@map("adminlog_card_glow_settings")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260909120000_add_card_glow_settings/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "adminlog_card_glow_settings" (
    "id" TEXT NOT NULL,
    "preset" TEXT NOT NULL DEFAULT 'subtle',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_card_glow_settings_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 3: Apply the migration to the live Supabase project**

Use the `mcp__supabase__apply_migration` tool (this project's tables are managed through Supabase directly, not a local Postgres — every existing `adminlog_*` table was created this way) with:
- `name`: `add_card_glow_settings`
- `query`: the exact SQL from Step 2

- [ ] **Step 4: Verify the table exists**

Use `mcp__supabase__list_tables` (or `execute_sql` with `select * from adminlog_card_glow_settings limit 1`) and confirm `adminlog_card_glow_settings` is listed with columns `id`, `preset`, `updatedAt`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260909120000_add_card_glow_settings
git commit -m "feat(adminlog): add CardGlowSetting table"
```

---

### Task 2: Preset/palette logic (`lib/theme/cardGlow.ts`, `lib/theme/glowPalette.ts`)

**Files:**
- Create: `lib/theme/cardGlow.ts`
- Create: `lib/theme/cardGlow.test.ts`
- Create: `lib/theme/glowPalette.ts`
- Create: `lib/theme/glowPalette.test.ts`

**Interfaces:**
- Produces:
  - `CARD_GLOW_PRESETS: { off, subtle, vibrant }` each `{ opacity: number, blur: string, border: string }`
  - `type CardGlowPreset = 'off' | 'subtle' | 'vibrant'`
  - `CARD_GLOW_PRESET_KEYS: CardGlowPreset[]`
  - `isCardGlowPreset(value: unknown): value is CardGlowPreset`
  - `interface CardGlowFields { preset?: string | null }`
  - `interface CardGlowPayload { global: CardGlowFields; apps: Record<string, CardGlowFields> }`
  - `CARD_GLOW_KEY: string` (SWR key)
  - `fetchCardGlow(): Promise<CardGlowPayload>`
  - `resolveCardGlowPreset(appPreset, globalPreset): CardGlowPreset` (defaults to `'subtle'`)
  - `glowColor(index: number): string` — cycles `var(--chart-1)`..`var(--chart-5)`
  - `glowGradient(index: number, angle?: number): string` — two-stop `linear-gradient` using `glowColor(index)`/`glowColor(index + 1)`
- Consumes: `apiFetch` from `@/lib/apiFetch` (same fetcher `AppThemeSettingsEffect`'s `fetchAppTheme` uses).

- [ ] **Step 1: Write the failing tests**

`lib/theme/cardGlow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCardGlowPreset, resolveCardGlowPreset } from './cardGlow';

describe('isCardGlowPreset', () => {
  it('accepts the three known presets', () => {
    expect(isCardGlowPreset('off')).toBe(true);
    expect(isCardGlowPreset('subtle')).toBe(true);
    expect(isCardGlowPreset('vibrant')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isCardGlowPreset('loud')).toBe(false);
    expect(isCardGlowPreset(null)).toBe(false);
    expect(isCardGlowPreset(undefined)).toBe(false);
    expect(isCardGlowPreset(1)).toBe(false);
  });
});

describe('resolveCardGlowPreset', () => {
  it('prefers the app-level preset when valid', () => {
    expect(resolveCardGlowPreset('vibrant', 'off')).toBe('vibrant');
  });

  it('falls back to the global preset when app-level is unset', () => {
    expect(resolveCardGlowPreset(undefined, 'off')).toBe('off');
    expect(resolveCardGlowPreset(null, 'off')).toBe('off');
  });

  it('falls back to subtle when neither is a valid preset', () => {
    expect(resolveCardGlowPreset(undefined, undefined)).toBe('subtle');
    expect(resolveCardGlowPreset('bogus', 'also-bogus')).toBe('subtle');
  });
});
```

`lib/theme/glowPalette.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { glowColor, glowGradient } from './glowPalette';

describe('glowColor', () => {
  it('maps 0-4 to chart-1 through chart-5', () => {
    expect(glowColor(0)).toBe('var(--chart-1)');
    expect(glowColor(4)).toBe('var(--chart-5)');
  });

  it('wraps positive indices past 5', () => {
    expect(glowColor(5)).toBe('var(--chart-1)');
    expect(glowColor(7)).toBe('var(--chart-3)');
  });

  it('wraps negative indices', () => {
    expect(glowColor(-1)).toBe('var(--chart-5)');
  });
});

describe('glowGradient', () => {
  it('builds a two-stop 135deg gradient by default', () => {
    expect(glowGradient(0)).toBe('linear-gradient(135deg, var(--chart-1), var(--chart-2))');
  });

  it('wraps the second stop past the palette end', () => {
    expect(glowGradient(4)).toBe('linear-gradient(135deg, var(--chart-5), var(--chart-1))');
  });

  it('accepts a custom angle', () => {
    expect(glowGradient(0, 90)).toBe('linear-gradient(90deg, var(--chart-1), var(--chart-2))');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/theme/cardGlow.test.ts lib/theme/glowPalette.test.ts`
Expected: FAIL — `cardGlow.ts`/`glowPalette.ts` don't exist yet.

- [ ] **Step 3: Implement `lib/theme/glowPalette.ts`**

```ts
// lib/theme/glowPalette.ts
//
// Shared hue source for cards that distinguish categories/items by color
// (wallet categories, trip cards, ...). Instead of each card inventing its
// own hex/Tailwind gradient, they cycle through the same 5-color chart
// palette (app/globals.css) via a stable per-item index — keeps items
// visually distinguishable while letting admin-controlled intensity
// (lib/theme/cardGlow.ts) apply uniformly across all of them.
const GLOW_PALETTE_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

export function glowColor(index: number): string {
  const safeIndex = ((index % GLOW_PALETTE_VARS.length) + GLOW_PALETTE_VARS.length) % GLOW_PALETTE_VARS.length;
  return `var(${GLOW_PALETTE_VARS[safeIndex]})`;
}

export function glowGradient(index: number, angle = 135): string {
  return `linear-gradient(${angle}deg, ${glowColor(index)}, ${glowColor(index + 1)})`;
}
```

- [ ] **Step 4: Implement `lib/theme/cardGlow.ts`**

```ts
// lib/theme/cardGlow.ts
//
// Admin-controlled gradient/glow intensity for dashboard cards. Mirrors
// lib/theme/appTheme.ts's shape/pattern (fetcher, SWR key, resolve fn) —
// see CardGlowSettingsEffect for how this gets applied live as CSS vars.
import { apiFetch } from '@/lib/apiFetch';

export const CARD_GLOW_PRESETS = {
  off: { opacity: 0, blur: '0px', border: '0px' },
  subtle: { opacity: 0.12, blur: '24px', border: '1px' },
  vibrant: { opacity: 0.28, blur: '40px', border: '1.5px' },
} as const;

export type CardGlowPreset = keyof typeof CARD_GLOW_PRESETS;

export const CARD_GLOW_PRESET_KEYS = Object.keys(CARD_GLOW_PRESETS) as CardGlowPreset[];

export function isCardGlowPreset(value: unknown): value is CardGlowPreset {
  return typeof value === 'string' && value in CARD_GLOW_PRESETS;
}

export interface CardGlowFields {
  preset?: string | null;
}

export interface CardGlowPayload {
  global: CardGlowFields;
  apps: Record<string, CardGlowFields>;
}

export const CARD_GLOW_KEY = 'adminlog-card-glow-settings';

/** Shared SWR fetcher/key — import these rather than re-declaring, so every
 * caller (CardGlowSettingsEffect, the admin page) hits the same SWR cache
 * entry instead of issuing separate requests. */
export async function fetchCardGlow(): Promise<CardGlowPayload> {
  const res = await apiFetch('/api/adminlog/card-glow');
  if (!res.ok) return { global: {}, apps: {} };
  return res.json();
}

export function resolveCardGlowPreset(
  appPreset: string | null | undefined,
  globalPreset: string | null | undefined
): CardGlowPreset {
  if (isCardGlowPreset(appPreset)) return appPreset;
  if (isCardGlowPreset(globalPreset)) return globalPreset;
  return 'subtle';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/theme/cardGlow.test.ts lib/theme/glowPalette.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/theme/cardGlow.ts lib/theme/cardGlow.test.ts lib/theme/glowPalette.ts lib/theme/glowPalette.test.ts
git commit -m "feat(theme): add card glow presets and shared hue palette helper"
```

---

### Task 3: API route `app/api/adminlog/card-glow/route.ts`

**Files:**
- Create: `app/api/adminlog/card-glow/route.ts`

**Interfaces:**
- Consumes: `isCardGlowPreset`, `CardGlowFields` from `@/lib/theme/cardGlow` (Task 2); `isAppId` from `@/lib/appMode`; `requireAdminCaller` from `@/lib/adminlog/testOnboarding`; `createClient` from `@/lib/supabase/server`; `createServiceRoleClient` from `@/lib/supabase/serviceRole` — all four already used identically by `app/api/adminlog/app-theme/route.ts`.
- Produces: `GET /api/adminlog/card-glow` → `{ global: CardGlowFields, apps: Record<string, CardGlowFields> }`; `PUT /api/adminlog/card-glow` with body `{ scope: 'global' | AppId, preset: CardGlowPreset }` → `{ ok: true }` or `{ error: string }`.

- [ ] **Step 1: Implement the route**

```ts
// app/api/adminlog/card-glow/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';
import { isCardGlowPreset, type CardGlowFields } from '@/lib/theme/cardGlow';

type Row = CardGlowFields & { id: string };

// Readable by any signed-in user — every page resolves its glow preset
// through this, not just adminlog.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('adminlog_card_glow_settings').select('id, preset');
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const global = rows.find((r) => r.id === 'global') ?? {};
    const apps: Record<string, CardGlowFields> = {};
    for (const row of rows) {
      if (row.id === 'global') continue;
      const { id, ...fields } = row;
      apps[id] = fields;
    }

    return NextResponse.json({ global, apps });
  } catch (error) {
    console.error('card-glow GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { scope, preset } = body as { scope?: string; preset?: unknown };
    if (scope !== 'global' && !isAppId(scope ?? null)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    if (!isCardGlowPreset(preset)) {
      return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_card_glow_settings')
      .upsert({ id: scope, preset, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('card-glow PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verification**

No automated test for this route — it requires a live authenticated Supabase session, and its two units of real logic (`isCardGlowPreset`, scope validation via `isAppId`) are already covered by Task 2's tests and the existing `isAppId` tests. Verify end-to-end once Task 6 (admin page) exists: signed in as an admin, `PUT` with an invalid preset returns 400; a valid `PUT` followed by `GET` round-trips the value.

- [ ] **Step 3: Commit**

```bash
git add app/api/adminlog/card-glow/route.ts
git commit -m "feat(adminlog): add card glow settings API route"
```

---

### Task 4: `CardGlowSettingsEffect` + mount in `RootLayoutClient`

**Files:**
- Create: `components/adminlog/CardGlowSettingsEffect.tsx`
- Modify: `app/RootLayoutClient.tsx:9` (import) and `:138` (mount, alongside `<AppThemeSettingsEffect />`)

**Interfaces:**
- Consumes: `CARD_GLOW_KEY`, `fetchCardGlow`, `resolveCardGlowPreset`, `CARD_GLOW_PRESETS` from `@/lib/theme/cardGlow` (Task 2); `getActiveApp` from `@/lib/appMode`.
- Produces: sets `--card-glow-opacity`, `--card-glow-blur`, `--card-glow-border` on `document.documentElement`. No exported values — mounted once, side-effect only, exactly like `AppThemeSettingsEffect`.

- [ ] **Step 1: Implement the effect component**

```tsx
// components/adminlog/CardGlowSettingsEffect.tsx
'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { getActiveApp } from '@/lib/appMode';
import { CARD_GLOW_KEY, CARD_GLOW_PRESETS, fetchCardGlow, resolveCardGlowPreset } from '@/lib/theme/cardGlow';

/** Mounted once in RootLayoutClient. Resolves the active app's glow preset
 * (app override → global → "subtle" default) and writes it as CSS custom
 * properties on <html> — --card-glow-opacity/--card-glow-blur/--card-glow-border
 * — that every migrated glow/gradient card reads from. Same
 * SWR-key-sharing, fail-open, MutationObserver-on-app-switch shape as
 * AppThemeSettingsEffect. */
export function CardGlowSettingsEffect() {
  const { data } = useSWR(CARD_GLOW_KEY, fetchCardGlow, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    function apply() {
      const payload = dataRef.current;
      const root = document.documentElement;
      const appPreset = payload?.apps[getActiveApp()]?.preset;
      const globalPreset = payload?.global?.preset;
      const resolved = resolveCardGlowPreset(appPreset, globalPreset);
      const values = CARD_GLOW_PRESETS[resolved];

      root.style.setProperty('--card-glow-opacity', String(values.opacity));
      root.style.setProperty('--card-glow-blur', values.blur);
      root.style.setProperty('--card-glow-border', values.border);
    }

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-app'],
    });
    return () => observer.disconnect();
  }, [data]);

  return null;
}
```

- [ ] **Step 2: Mount it in `RootLayoutClient`**

In `app/RootLayoutClient.tsx`, add the import next to the existing `AppThemeSettingsEffect` import (line 9):

```ts
import { AppThemeSettingsEffect } from "@/components/adminlog/AppThemeSettingsEffect";
import { CardGlowSettingsEffect } from "@/components/adminlog/CardGlowSettingsEffect";
```

And mount it directly after `<AppThemeSettingsEffect />` (around line 138):

```tsx
                <AppThemeSettingsEffect />
                <CardGlowSettingsEffect />
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open any page, open devtools, run `getComputedStyle(document.documentElement).getPropertyValue('--card-glow-opacity')` in the console — expect `0.12` (the `subtle` default, since no `CardGlowSetting` rows exist yet). Confirm no console errors from the new SWR fetch (a 404/empty response resolves to `{ global: {}, apps: {} }` per `fetchCardGlow`'s fail-open behavior).

- [ ] **Step 4: Commit**

```bash
git add components/adminlog/CardGlowSettingsEffect.tsx app/RootLayoutClient.tsx
git commit -m "feat(adminlog): apply card glow preset as CSS vars on <html>"
```

---

### Task 5: Admin nav entry + `app/(adminlog)/adminlog/card-glow/page.tsx`

**Files:**
- Modify: `lib/adminlog/nav.ts` (add import + nav item)
- Create: `app/(adminlog)/adminlog/card-glow/page.tsx`

**Interfaces:**
- Consumes: `useRequireAdmin` from `@/lib/adminlog/useRequireAdmin`; `apiFetch` from `@/lib/apiFetch`; `APPS`, `AppId` from `@/lib/appMode`; `CARD_GLOW_KEY`, `CARD_GLOW_PRESET_KEYS`, `CARD_GLOW_PRESETS`, `resolveCardGlowPreset`, `CardGlowFields`, `CardGlowPreset` from `@/lib/theme/cardGlow` (Task 2); `mutate` from `swr`; existing `Card`/`CardContent`, `Label`, `Button`, `Select*` UI primitives.

- [ ] **Step 1: Add the nav entry**

In `lib/adminlog/nav.ts`, add `Sparkle` to the lucide-react import list (line 8-27):

```ts
import {
  Settings,
  Bug,
  UserPlus,
  Users,
  Wrench,
  Rocket,
  Brain,
  Database,
  FlaskConical,
  Palette,
  ToggleLeft,
  Sparkles,
  Sparkle,
  Shapes,
  Type,
  Megaphone,
  Paintbrush,
  Film,
  SwatchBook,
} from 'lucide-react';
```

Then add a new item to the `ui-themes` category's `items` array (after the `app-theme` entry, before `design-system`):

```ts
      { href: '/adminlog/app-theme', label: 'App Theme', description: 'Set primary and background colors, light & dark, globally or per app.', icon: Paintbrush },
      { href: '/adminlog/card-glow', label: 'Card Glow', description: 'Set how strong gradients and glow effects look on dashboard cards, globally or per app.', icon: Sparkle },
      { href: '/adminlog/design-system', label: 'Design Systems', description: 'Apply a curated color, shape, and typography bundle across the whole app.', icon: SwatchBook },
```

- [ ] **Step 2: Implement the admin page**

```tsx
// app/(adminlog)/adminlog/card-glow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { mutate } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPS, type AppId } from '@/lib/appMode';
import {
  CARD_GLOW_KEY,
  CARD_GLOW_PRESET_KEYS,
  CARD_GLOW_PRESETS,
  resolveCardGlowPreset,
  type CardGlowFields,
  type CardGlowPreset,
} from '@/lib/theme/cardGlow';

const PRESET_LABELS: Record<CardGlowPreset, string> = {
  off: 'Off',
  subtle: 'Subtle',
  vibrant: 'Vibrant',
};

const SCOPE_OPTIONS: { value: 'global' | AppId; label: string }[] = [
  { value: 'global', label: 'Global (default for every app)' },
  ...(Object.values(APPS).map((a) => ({ value: a.id, label: a.name })) as { value: AppId; label: string }[]),
];

export default function CardGlowPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | AppId>('global');
  const [global, setGlobalState] = useState<CardGlowFields>({});
  const [apps, setApps] = useState<Record<string, CardGlowFields>>({});

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/card-glow');
      if (res.ok) {
        const data = await res.json();
        setGlobalState(data.global ?? {});
        setApps(data.apps ?? {});
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  const current: CardGlowFields = scope === 'global' ? global : (apps[scope] ?? {});
  const resolvedPreset = resolveCardGlowPreset(scope === 'global' ? undefined : apps[scope]?.preset, global.preset);

  async function setPreset(preset: CardGlowPreset) {
    if (scope === 'global') setGlobalState((prev) => ({ ...prev, preset }));
    else setApps((prev) => ({ ...prev, [scope]: { ...prev[scope], preset } }));

    setSaving(true);
    await apiFetch('/api/adminlog/card-glow', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, preset }),
    });
    setSaving(false);
    // Every consumer (CardGlowSettingsEffect, this page) shares this SWR
    // key — revalidate so the change is visible immediately instead of
    // waiting out the 60s dedupingInterval.
    mutate(CARD_GLOW_KEY);
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const previewStyle = {
    '--card-glow-opacity': CARD_GLOW_PRESETS[resolvedPreset].opacity,
    '--card-glow-blur': CARD_GLOW_PRESETS[resolvedPreset].blur,
  } as CSSProperties;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Sets how strong gradients and glow effects look on dashboard cards, globally or per app. An app-level
        choice always wins over global; leaving a scope unset falls back to global, then to Subtle.
      </p>

      <div className="space-y-2">
        <Label htmlFor="scope">Scope</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as 'global' | AppId)}>
          <SelectTrigger id="scope" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {CARD_GLOW_PRESET_KEYS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={(current.preset ?? resolvedPreset) === preset ? 'default' : 'outline'}
                  disabled={saving}
                  onClick={() => setPreset(preset)}
                >
                  {PRESET_LABELS[preset]}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Live preview</p>
          <div className="relative h-24 overflow-hidden rounded-xl border bg-card" style={previewStyle}>
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--chart-2))',
                opacity: 'var(--card-glow-opacity)',
                filter: 'blur(var(--card-glow-blur))',
              }}
            />
            <div className="relative flex h-full items-center justify-center text-sm text-muted-foreground">
              {PRESET_LABELS[resolvedPreset]} preview
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in as an admin, visit `/adminlog` → UI → Card Glow. Confirm: the three preset buttons render, clicking one highlights it and the live preview's blur/opacity visibly changes, switching Scope to an app and picking a different preset than Global persists independently (reload the page and confirm both scopes kept their own values), and the browser console shows no errors on save.

- [ ] **Step 4: Commit**

```bash
git add lib/adminlog/nav.ts "app/(adminlog)/adminlog/card-glow/page.tsx"
git commit -m "feat(adminlog): add Card Glow admin page"
```

---

### Task 6: Migrate `NeonGradientCard`

**Files:**
- Modify: `components/ui/neon-gradient-card.tsx:110-152`

**Interfaces:**
- No signature change — `borderSize`/`borderRadius`/`neonColors` props and their defaults are unchanged. Only the glow's blur radius and the `after` layer's opacity now read from `--card-glow-blur`/`--card-glow-opacity` (falling back to the previous hardcoded 6px/60% when the vars are unset, e.g. in Storybook-style isolated renders).

- [ ] **Step 1: Wire blur and opacity to the CSS vars**

In `components/ui/neon-gradient-card.tsx`, change the inline style block (around line 130):

```ts
          // Fixed, not proportional to card width — these cards now sit in
          // tight grids everywhere (2-3 columns), and a width-scaled blur
          // (the old `width / 3`) radiates far past a card's own edges,
          // bleeding into neighbors instead of staying a contained glow.
          // Driven by AdminLog > UI > Card Glow (CardGlowSettingsEffect sets
          // --card-glow-blur/--card-glow-opacity on <html>); falls back to
          // the original fixed 6px / 60% when unset.
          "--after-blur": "var(--card-glow-blur, 6px)",
          "--after-opacity": "var(--card-glow-opacity, 0.6)",
```

(replacing the old `"--after-blur": "6px",` line and its comment; remove the now-superseded comment about "6px, down from 10px").

Then change the `after:opacity-60` class in the `className={cn(...)}` call (around line 152) to reference the new var, using this file's existing `<utility>-(--var)` arbitrary-property syntax (already used for `after:blur-(--after-blur)` two lines above it):

```ts
          "after:bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] after:bg-size-[100%_200%] after:opacity-(--after-opacity)",
```

- [ ] **Step 2: Manual verification**

`npm run dev`, visit any page using `StatCard`/`NeonGradientCard` (e.g. a sub-app dashboard). With the default `subtle` preset (no rows in `CardGlowSetting` yet), the glow should look visibly softer/dimmer than before. In `/adminlog` → Card Glow, switch the global preset to `Vibrant` and reload the dashboard — the glow should look stronger; switch to `Off` — the glow should disappear entirely (0 opacity, 0 blur) while the card's flat border (`--border-size`, untouched) remains.

- [ ] **Step 3: Commit**

```bash
git add components/ui/neon-gradient-card.tsx
git commit -m "feat(ui): drive NeonGradientCard glow from admin-controlled CSS vars"
```

---

### Task 7: Migrate `GlowingEffect`

**Files:**
- Modify: `components/kokonutui/glowing-effect.tsx:174`

**Interfaces:**
- No signature change — `blur` prop keeps its existing meaning (an explicit caller-supplied blur in pixels). When a caller passes `blur={0}` (the default — most callers leave it unset), the effect now falls back to `var(--card-glow-blur)` instead of no blur at all.

- [ ] **Step 1: Fall back to the admin-controlled blur var**

In `components/kokonutui/glowing-effect.tsx`, change line 174:

```ts
          // Explicit blur prop wins (some callers deliberately tune this
          // per-instance); otherwise falls back to AdminLog > UI > Card
          // Glow's admin-controlled blur.
          filter: blur > 0 ? `blur(${blur}px)` : "blur(var(--card-glow-blur, 0px))",
```

(replacing the old `filter: blur > 0 ? \`blur(${blur}px)\` : undefined,` line.)

- [ ] **Step 2: Manual verification**

Find a page that renders `<GlowingEffect glow disabled={false} />` (e.g. `grep -rn "GlowingEffect" app components | grep -v glowing-effect.tsx` to locate a call site), hover/hold near the card on that page, and confirm the border-chase glow still animates. In `/adminlog` → Card Glow, switch the global preset between `Off`/`Subtle`/`Vibrant` and confirm the glow's blur softness changes accordingly (most visible on `Vibrant`, since its blur is the largest of the three).

- [ ] **Step 3: Commit**

```bash
git add components/kokonutui/glowing-effect.tsx
git commit -m "feat(ui): fall back GlowingEffect's blur to the admin-controlled CSS var"
```

---

### Task 8: Migrate `AssetWalletCard`

**Files:**
- Modify: `components/moneylog/AssetWalletCard.tsx`

**Interfaces:**
- Consumes: `glowGradient` from `@/lib/theme/glowPalette` (Task 2).
- No prop/signature change to `AssetWalletCardProps`.

- [ ] **Step 1: Replace `CATEGORY_GRADIENTS` with palette-index lookup**

Replace the full contents of `components/moneylog/AssetWalletCard.tsx`:

```tsx
// components/moneylog/AssetWalletCard.tsx
// A card-styled visual summary of a MoneyLog asset — inspired by kibo-ui's
// CreditCard (https://www.kibo-ui.com/components/credit-card), simplified
// to a single face with no fake card number/expiry/CVV, since this
// represents a savings/investment/cash/debt account, not a real payment
// card (see the Foundation-era decision: visual only, no real card data).
'use client';

import { formatCurrency } from '@/lib/format';
import { assetCategoryLabel } from '@/lib/moneylog/assetCategories';
import { glowGradient } from '@/lib/theme/glowPalette';
import { cn } from '@/lib/utils';

// Stable per-category index into the shared chart palette (glowGradient) —
// categories stay visually distinct from each other, but draw from the
// same 5-color palette every other identity-gradient card uses instead of
// each card inventing its own hex values.
const CATEGORY_ORDER = ['bank', 'investment', 'cash', 'debt', 'other'] as const;

function categoryIndex(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
  return i === -1 ? CATEGORY_ORDER.length - 1 : i;
}

interface AssetWalletCardProps {
  name: string;
  category: string;
  value: number;
  className?: string;
}

export function AssetWalletCard({ name, category, value, className }: AssetWalletCardProps) {
  return (
    <div
      className={cn('relative aspect-[8560/5398] w-full max-w-96 overflow-hidden rounded-2xl p-5 text-white shadow-lg', className)}
      style={{ background: glowGradient(categoryIndex(category)) }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/70">
          {assetCategoryLabel(category)}
        </span>
        <div className="h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500" aria-hidden="true" />
      </div>
      <p className="mt-6 truncate text-lg font-semibold uppercase" style={{ lineHeight: '100%' }}>
        {name}
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums" style={{ lineHeight: '100%' }}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
```

(The small yellow "chip" ornament is a fixed card-face decoration, not a category identity color — left as-is.)

- [ ] **Step 2: Manual verification**

`npm run dev`, visit MoneyLog's assets view, confirm each category (bank/investment/cash/debt/other) still renders a distinct gradient and text stays legible (white text on all five palette colors — check both light and dark mode, since `--chart-1..5` differ per theme per `app/globals.css`).

- [ ] **Step 3: Commit**

```bash
git add components/moneylog/AssetWalletCard.tsx
git commit -m "feat(moneylog): normalize AssetWalletCard category colors onto shared palette"
```

---

### Task 9: Migrate `NetWorthSummaryCard`

**Files:**
- Modify: `app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx`

**Interfaces:**
- No prop/signature change to `NetWorthSummaryCardProps`.

- [ ] **Step 1: Replace hardcoded emerald/red with the existing semantic tokens**

This card's colors are a binary status signal (positive vs. negative net worth), not an arbitrary category — collapsing it into the neutral 5-color chart palette would remove that meaning. `app/globals.css` already defines theme-aware `--success`/`--destructive` tokens (used elsewhere for this exact positive/negative distinction) — migrate onto those instead of `glowGradient`, trading the hardcoded Tailwind literal for the existing semantic token rather than the identity palette.

Replace the full contents of `app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx`:

```tsx
// app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx
'use client';

import { Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface NetWorthSummaryCardProps {
  netWorth: number;
  assetCount: number;
}

// Same gradient-card visual language as AssetWalletCard (kibo-ui's
// CreditCard, simplified) — this is a binary status signal (positive vs.
// negative), not an arbitrary category, so it stays on the existing
// semantic --success/--destructive tokens rather than the category hue
// palette AssetWalletCard uses.
export function NetWorthSummaryCard({ netWorth, assetCount }: NetWorthSummaryCardProps) {
  const tone = netWorth < 0 ? 'var(--destructive)' : 'var(--success)';
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl p-5 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${tone}, color-mix(in oklch, ${tone}, black 35%))` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/70">Net Worth</span>
        <Wallet className="h-5 w-5 text-white/70" aria-hidden="true" />
      </div>
      <p className="mt-6 font-mono text-3xl font-semibold tabular-nums" style={{ lineHeight: '100%' }}>
        {formatCurrency(netWorth)}
      </p>
      <p className="mt-2 text-xs text-white/70">
        Across {assetCount} asset{assetCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Visit MoneyLog's assets view with a positive net worth (green-toned card) and, if reachable, a negative one (red-toned card) — confirm both render with legible white text in light and dark mode.

- [ ] **Step 3: Commit**

```bash
git add "app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx"
git commit -m "feat(moneylog): migrate NetWorthSummaryCard onto semantic success/destructive tokens"
```

---

### Task 10: Migrate `WeeklyTripStack`

**Files:**
- Modify: `components/travellog/WeeklyTripStack.tsx:32-38` (remove `AURORA_GRADIENTS`), `:187-190` (use `glowGradient`)

**Interfaces:**
- Consumes: `glowGradient` from `@/lib/theme/glowPalette` (Task 2).
- No prop/signature change to `WeeklyTripStack` or `TripCardItem`.

- [ ] **Step 1: Replace the hardcoded gradient array**

In `components/travellog/WeeklyTripStack.tsx`, remove the `AURORA_GRADIENTS` constant (lines 32-38):

```ts
const AURORA_GRADIENTS = [
  'linear-gradient(135deg, #f6a63f, #e8447b)',
  'linear-gradient(135deg, #17b47a, #4a95f0)',
  'linear-gradient(135deg, #4a95f0, #8b5fe8)',
  'linear-gradient(135deg, #e8447b, #8b5fe8)',
  'linear-gradient(135deg, #f6a63f, #17b47a)',
];
```

and add the import at the top (near the other imports, line 6):

```ts
import { cn } from '@/lib/utils';
import { glowGradient } from '@/lib/theme/glowPalette';
```

- [ ] **Step 2: Use `glowGradient(i)` at the call site**

Change line 189 from:

```ts
              style={{ background: AURORA_GRADIENTS[i % AURORA_GRADIENTS.length] }}
```

to:

```ts
              style={{ background: glowGradient(i) }}
```

- [ ] **Step 3: Manual verification**

Visit TravelLog's weekly trip stack, scroll/swipe through several cards, confirm each still shows a distinct-looking header gradient and the deck's animation/scroll behavior is unaffected (this task only touches the `background` value, nothing else in the component).

- [ ] **Step 4: Commit**

```bash
git add components/travellog/WeeklyTripStack.tsx
git commit -m "feat(travellog): normalize WeeklyTripStack card colors onto shared palette"
```

---

### Task 11: Migrate `AppleActivityCard`'s drop-shadow

**Files:**
- Modify: `components/kokonutui/apple-activity-card.tsx:132-134`

**Interfaces:**
- No prop/signature change — `ActivityData.color`/`colorEnd` (the Apple-Watch-style semantic ring colors: red=Move, green=Exercise, blue=Stand) are untouched; only the ring's drop-shadow blur/alpha now scale with the admin preset.

- [ ] **Step 1: Wire the drop-shadow to the CSS vars**

In `components/kokonutui/apple-activity-card.tsx`, change lines 132-134:

```tsx
            style={{
              // Falls back to the original fixed 6px / 0.15 alpha when the
              // admin-controlled vars are unset (AdminLog > UI > Card Glow).
              filter: "drop-shadow(0 0 var(--card-glow-blur, 6px) rgba(0,0,0,var(--card-glow-opacity, 0.15)))",
            }}
```

- [ ] **Step 2: Manual verification**

Find a page rendering `AppleActivityCard` (`grep -rn "AppleActivityCard\|apple-activity-card" app components`), confirm the three activity rings (Move/Exercise/Stand) still show their fixed red/green/blue colors with a soft shadow. Toggle the global Card Glow preset between `Off`/`Subtle`/`Vibrant` and confirm the ring shadow's softness/darkness visibly changes.

- [ ] **Step 3: Commit**

```bash
git add components/kokonutui/apple-activity-card.tsx
git commit -m "feat(ui): drive AppleActivityCard ring shadow from admin-controlled CSS vars"
```

---

### Task 12: Migrate `CurrencyTransferCard`'s glow blob

**Files:**
- Modify: `components/ui/currency-transfer-card.tsx:39`

**Interfaces:**
- No prop/signature change.

- [ ] **Step 1: Replace the hardcoded `bg-primary/20 blur-xl` with admin-controlled vars**

In `components/ui/currency-transfer-card.tsx`, change line 39 from:

```tsx
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
```

to:

```tsx
        <div
          className="absolute inset-0 rounded-full bg-primary"
          style={{ opacity: 'var(--card-glow-opacity, 0.2)', filter: 'blur(var(--card-glow-blur, 24px))' }}
        />
```

(`blur-xl` is Tailwind's 24px, so `24px` is the equivalent fallback; `/20` is Tailwind's 20% alpha, so `0.2` is the equivalent fallback — both preserve the original look when the CSS vars are unset.)

- [ ] **Step 2: Manual verification**

Find a page rendering `CurrencyTransferCard` (`grep -rn "CurrencyTransferCard" app components`), confirm the glow blob behind the status icon still renders, and confirm it visibly dims/brightens when switching the global Card Glow preset.

- [ ] **Step 3: Commit**

```bash
git add components/ui/currency-transfer-card.tsx
git commit -m "feat(ui): drive CurrencyTransferCard glow blob from admin-controlled CSS vars"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS, including the 10 new tests from Task 2 and every pre-existing test.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: both clean (no new errors introduced by any task above).

- [ ] **Step 3: Screenshot pass across presets**

`npm run dev`. In `/adminlog` → Card Glow, for each of `Off` / `Subtle` / `Vibrant` (global scope), visit and screenshot, in both light and dark mode:
- A dashboard using `StatCard`/`NeonGradientCard` (Task 6)
- MoneyLog assets view (`AssetWalletCard` + `NetWorthSummaryCard`, Tasks 8-9)
- TravelLog's weekly trip stack (Task 10)
- Any page with `AppleActivityCard` (Task 11) and `CurrencyTransferCard` (Task 12), if reachable in this environment

Confirm: `Off` shows no glow/blur anywhere; `Vibrant` is visibly stronger than `Subtle`; `AssetWalletCard`/`WeeklyTripStack` items remain distinguishable from each other at every preset; no card renders unstyled or with broken/illegible text.

- [ ] **Step 4: Confirm per-app override**

In Card Glow, set Global to `Subtle` and one specific app (e.g. MoneyLog) to `Vibrant`. Reload that app's dashboard and a different app's dashboard — confirm only the overridden app shows the stronger glow.
