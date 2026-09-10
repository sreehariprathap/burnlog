# UI v2 (Glass) Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global, admin-controlled boolean that switches Button/Card/Input/bottom-nav between today's flat look (v1, default) and a glass look (v2) built from the DesignCode UI Figma tokens already in `app/globals.css`, with zero visual change when the flag is off.

**Architecture:** Follow the existing AdminLog settings pattern exactly (`AppThemeSetting`/`TypographySetting`/`CardGlowSetting`): a Supabase table + Prisma model, a `GET`(public)/`PUT`(admin) API route, a `lib/theme/uiVersion.ts` fetch helper, and a `UiVersionSettingsEffect` client component that stamps `data-ui-version="v1"|"v2"` on `<html>`. New CSS custom properties (`--surface-*`) hold the actual values components render with; v1 values in `:root` are copied verbatim from today's current styling, v2 values are redefined under `:root[data-ui-version="v2"]` from the glass tokens already added. Components switch from literal Tailwind color/shadow/blur utilities to small unlayered CSS classes (`.surface-card`, `.surface-button-chrome`, `.surface-input`, `.surface-nav`) that read those custom properties — unlayered CSS always wins over Tailwind's layered utilities in this codebase (see the existing convention documented at the top of `app/globals.css`), so no specificity fights.

**Tech Stack:** Next.js 15 / React, Tailwind CSS v4, Supabase (Postgres) via Prisma migrations, SWR, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-ui-v2-glass-toggle-design.md`

## Global Constraints

- Default `enabled = false` (v1) — no visual change on ship.
- Global-only setting, no per-app override.
- v1 CSS values must be copied verbatim from current production values — v1 must be provably a no-op.
- Per-app accent colors (`--primary`, `--secondary`, etc.) are never touched by this change.
- In scope: Button (`outline`/`secondary`/`default`/`destructive` variants), Card, Input, the 12 bottom-nav components. Out of scope: everything else (dialogs, sheets, popovers, etc.) — do not touch them.
- Every task ends with `npm run build` passing.

---

### Task 1: Database table + Prisma model

**Files:**
- Create: `prisma/migrations/20260910130000_add_ui_version_settings/migration.sql`
- Modify: `prisma/schema.prisma` (add model near `CardGlowSetting`, around line 1789)

**Interfaces:**
- Produces: Supabase table `adminlog_ui_version_settings` with columns `id text primary key default 'global'`, `enabled boolean not null default false`, `updatedAt timestamp`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- CreateTable
CREATE TABLE "adminlog_ui_version_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adminlog_ui_version_settings_pkey" PRIMARY KEY ("id")
);
```

Save as `prisma/migrations/20260910130000_add_ui_version_settings/migration.sql`.

- [ ] **Step 2: Add the Prisma model**

In `prisma/schema.prisma`, immediately before the `model CardGlowSetting {` block, add:

```prisma
model UiVersionSetting {
  id        String   @id @default("global") // always "global" — no per-app scoping
  enabled   Boolean  @default(false)
  updatedAt DateTime @updatedAt

  @@map("adminlog_ui_version_settings")
}
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration applies cleanly, Prisma Client regenerates with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/20260910130000_add_ui_version_settings prisma/schema.prisma
git commit -m "db: add adminlog_ui_version_settings table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: API route

**Files:**
- Create: `app/api/adminlog/ui-version/route.ts`
- Test: `app/api/adminlog/ui-version/route.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient` from `@/lib/supabase/serviceRole`, `requireAdminCaller` from `@/lib/adminlog/testOnboarding`, `createClient` from `@/lib/supabase/server`.
- Produces: `GET` → `{ enabled: boolean }`. `PUT` (body `{ enabled: boolean }`, admin-only) → `{ ok: true }` or `{ error: string }` with matching status.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/adminlog/ui-version/route.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/serviceRole', () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/adminlog/testOnboarding', () => ({
  requireAdminCaller: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { createClient } from '@/lib/supabase/server';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { GET, PUT } from './route';

function fakeSelect(row: { id: string; enabled: boolean } | null) {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: row ? [row] : [], error: null }),
    }),
  };
}

function fakeUpsert() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: () => ({ upsert }) }, upsert };
}

describe('GET /api/adminlog/ui-version', () => {
  it('returns enabled:false when no row exists', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeSelect(null));
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  it('returns enabled:true when the global row has enabled:true', async () => {
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeSelect({ id: 'global', enabled: true })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(true);
  });
});

describe('PUT /api/adminlog/ui-version', () => {
  it('rejects a non-admin caller', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost/api/adminlog/ui-version', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('upserts the global row for an admin caller', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (requireAdminCaller as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin-1' });
    const { client, upsert } = fakeUpsert();
    (createServiceRoleClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);
    const req = new Request('http://localhost/api/adminlog/ui-version', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PUT(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'global', enabled: true }),
      { onConflict: 'id' }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/adminlog/ui-version/route.test.ts`
Expected: FAIL — `./route` has no exported member `GET`/`PUT` (file doesn't exist yet).

- [ ] **Step 3: Write the route**

```typescript
// app/api/adminlog/ui-version/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';

// Public read — every page needs to resolve this before first paint, same
// as app-theme.
export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('adminlog_ui_version_settings').select('id, enabled');
    if (error) throw error;

    const rows = (data ?? []) as { id: string; enabled: boolean }[];
    const global = rows.find((r) => r.id === 'global');
    return NextResponse.json({ enabled: global?.enabled ?? false });
  } catch (error) {
    console.error('ui-version GET error:', error);
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
    const { enabled } = body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('adminlog_ui_version_settings')
      .upsert({ id: 'global', enabled, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('ui-version PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/adminlog/ui-version/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/adminlog/ui-version
git commit -m "feat(adminlog): add ui-version settings API route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/theme/uiVersion.ts` + `UiVersionSettingsEffect` + mount

**Files:**
- Create: `lib/theme/uiVersion.ts`
- Create: `components/adminlog/UiVersionSettingsEffect.tsx`
- Modify: `app/RootLayoutClient.tsx:8-10` (import) and `:138-140` (mount)

**Interfaces:**
- Consumes: `apiFetch` from `@/lib/apiFetch`.
- Produces: `UI_VERSION_KEY` (SWR key string), `fetchUiVersion(): Promise<{ enabled: boolean }>`, `<UiVersionSettingsEffect />` (no props, renders `null`).

- [ ] **Step 1: Write the lib helper**

```typescript
// lib/theme/uiVersion.ts
//
// AdminLog > UI > "v2 (Beta)" — a single global boolean that switches core
// chrome primitives (Button/Card/Input/bottom-nav) between today's flat
// look and the glass look. No per-app override — see
// UiVersionSettingsEffect for how this gets applied as a data attribute.
import { apiFetch } from '@/lib/apiFetch';

export const UI_VERSION_KEY = 'adminlog-ui-version-settings';

export async function fetchUiVersion(): Promise<{ enabled: boolean }> {
  const res = await apiFetch('/api/adminlog/ui-version');
  if (!res.ok) return { enabled: false };
  return res.json();
}
```

- [ ] **Step 2: Write the effect component**

```typescript
// components/adminlog/UiVersionSettingsEffect.tsx
'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { UI_VERSION_KEY, fetchUiVersion } from '@/lib/theme/uiVersion';

/** Mounted once in RootLayoutClient. Stamps data-ui-version="v1"|"v2" on
 * <html> from the global admin toggle — every --surface-* CSS variable in
 * app/globals.css is keyed off that attribute. */
export function UiVersionSettingsEffect() {
  const { data } = useSWR(UI_VERSION_KEY, fetchUiVersion, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-version', data?.enabled ? 'v2' : 'v1');
  }, [data?.enabled]);

  return null;
}
```

- [ ] **Step 3: Mount it in RootLayoutClient**

In `app/RootLayoutClient.tsx`, add the import next to the other settings effects (around line 10):

```typescript
import { CardGlowSettingsEffect } from "@/components/adminlog/CardGlowSettingsEffect";
import { UiVersionSettingsEffect } from "@/components/adminlog/UiVersionSettingsEffect";
```

And mount it next to `<CardGlowSettingsEffect />` (around line 140):

```typescript
                <CardGlowSettingsEffect />
                <UiVersionSettingsEffect />
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: builds cleanly, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/theme/uiVersion.ts components/adminlog/UiVersionSettingsEffect.tsx app/RootLayoutClient.tsx
git commit -m "feat(adminlog): wire ui-version setting to data-ui-version attribute

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `--surface-*` CSS tokens

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `--color-glass`, `--color-glass-border`, `--color-glass-border-secondary`, `--shadow-glass`, `--blur-glass`, `--app-shadow-xs`, `--app-shadow-lg` (all already defined in this file).
- Produces: `--surface-card-*`, `--surface-button-chrome-*`, `--surface-button-elevated-shadow`, `--surface-input-*`, `--surface-nav-*` custom properties, plus unlayered classes `.surface-card`, `.surface-button-chrome`, `.surface-button-elevated`, `.surface-input`, `.surface-nav` that later tasks apply to components.

- [ ] **Step 1: Add v1 defaults to `:root`**

In `app/globals.css`, inside the existing `:root { ... }` block, immediately after the `--glass-divider: ...;` line added previously, add:

```css
  /* v1 (default/current) values for the surface tokens components render
   * with. Copied verbatim from today's literal Tailwind utilities so v1 is
   * provably a no-op — see the :root[data-ui-version="v2"] block below for
   * the glass values these switch to. */
  --surface-card-bg: var(--card);
  --surface-card-border: var(--border);
  --surface-card-shadow: var(--app-shadow-sm);
  --surface-card-blur: 0px;
  --surface-card-radius: var(--radius-xl);
  --surface-button-chrome-bg: var(--background);
  --surface-button-chrome-border: var(--border);
  --surface-button-chrome-shadow: var(--app-shadow-xs);
  --surface-button-chrome-blur: 0px;
  --surface-button-elevated-shadow: var(--app-shadow-xs);
  --surface-input-bg: transparent;
  --surface-input-border: var(--input);
  --surface-input-radius: var(--radius-md);
  --surface-nav-bg: color-mix(in oklab, var(--background) 40%, transparent);
  --surface-nav-border: rgb(255 255 255 / 0.1);
  --surface-nav-blur: 12px;
  --surface-nav-shadow: var(--app-shadow-lg);
```

- [ ] **Step 2: Add the v2 override block**

Immediately after the `:root { ... }` block closes, add a new block:

```css
/* UI v2 (glass) — redefines every --surface-* token from the glass
 * primitives above. Toggled by UiVersionSettingsEffect stamping
 * data-ui-version on <html>; see docs/superpowers/specs/2026-09-10-ui-v2-glass-toggle-design.md */
:root[data-ui-version="v2"] {
  --surface-card-bg: var(--color-glass);
  --surface-card-border: var(--color-glass-border);
  --surface-card-shadow: var(--shadow-glass);
  --surface-card-blur: var(--blur-glass);
  --surface-button-chrome-bg: var(--color-glass);
  --surface-button-chrome-border: var(--color-glass-border);
  --surface-button-chrome-shadow: var(--shadow-glass);
  --surface-button-chrome-blur: var(--blur-glass);
  --surface-button-elevated-shadow: var(--shadow-glass);
  --surface-input-bg: var(--color-glass);
  --surface-input-border: var(--color-glass-border-secondary);
  --surface-nav-bg: var(--color-glass);
  --surface-nav-border: var(--color-glass-border);
  --surface-nav-blur: var(--blur-glass);
  --surface-nav-shadow: var(--shadow-glass);
}
```

- [ ] **Step 3: Add the unlayered surface classes**

Near the existing `.glowing-effect-glow` rules (unlayered, i.e. not inside any `@layer` block — that's what makes them beat Tailwind's layered utilities regardless of specificity, per the convention already documented in this file), add:

```css
.surface-card {
  background-color: var(--surface-card-bg);
  border-color: var(--surface-card-border);
  box-shadow: var(--surface-card-shadow);
  backdrop-filter: blur(var(--surface-card-blur));
  border-radius: var(--surface-card-radius);
}

.surface-button-chrome {
  background-color: var(--surface-button-chrome-bg);
  border-color: var(--surface-button-chrome-border);
  box-shadow: var(--surface-button-chrome-shadow);
  backdrop-filter: blur(var(--surface-button-chrome-blur));
}

.surface-button-elevated {
  box-shadow: var(--surface-button-elevated-shadow);
}

.surface-input {
  background-color: var(--surface-input-bg);
  border-color: var(--surface-input-border);
  border-radius: var(--surface-input-radius);
}

.surface-nav {
  background-color: var(--surface-nav-bg);
  border: 1px solid var(--surface-nav-border);
  backdrop-filter: blur(var(--surface-nav-blur));
  box-shadow: var(--surface-nav-shadow);
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: builds cleanly. (These classes aren't referenced by any component yet, so no visual change is expected until Tasks 5-8.)

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "style: add --surface-* v1/v2 CSS tokens for the glass UI toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Consolidate the 12 bottom-nav components onto `.surface-nav`

**Files:**
- Create: `lib/ui/navShell.ts`
- Modify: `components/BottomNav.tsx`, `components/HomeLogBottomNav.tsx`, `components/MoneyLogBottomNav.tsx`, `components/WatchLogBottomNav.tsx`, `components/TravelLogBottomNav.tsx`, `components/SocialLogBottomNav.tsx`, `components/TaskLogBottomNav.tsx`, `components/LearnLogBottomNav.tsx`, `components/ShoppingLogBottomNav.tsx`, `components/IntelLogBottomNav.tsx`, `components/LogbookBottomNav.tsx`, `components/adminlog/AdminLogBottomNav.tsx`

**Interfaces:**
- Consumes: `.surface-nav` class from Task 4.
- Produces: `NAV_SHELL_CLASS` (string constant) other nav components can import.

- [ ] **Step 1: Create the shared class constant**

```typescript
// lib/ui/navShell.ts
//
// The floating pill wrapper every per-app bottom nav renders. Was 12
// byte-identical literal className strings; consolidated here so the
// glass UI toggle (.surface-nav, see app/globals.css) only needs to
// change once. Zero visual change from consolidating this by itself.
export const NAV_SHELL_CLASS =
  'fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full surface-nav px-2 py-2';
```

- [ ] **Step 2: Update each of the 12 nav components**

In each file below, add the import:

```typescript
import { NAV_SHELL_CLASS } from '@/lib/ui/navShell';
```

And replace the wrapper element's `className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"` with `className={NAV_SHELL_CLASS}` (if the component also appends more classes via a template literal or `cn()`, keep that pattern — just substitute this literal for `NAV_SHELL_CLASS`).

Files to update (identical substitution in each):
- `components/BottomNav.tsx:45`
- `components/HomeLogBottomNav.tsx:47`
- `components/MoneyLogBottomNav.tsx:59`
- `components/WatchLogBottomNav.tsx:51`
- `components/TravelLogBottomNav.tsx:58`
- `components/SocialLogBottomNav.tsx:51`
- `components/TaskLogBottomNav.tsx:67`
- `components/LearnLogBottomNav.tsx:74`
- `components/ShoppingLogBottomNav.tsx:51`
- `components/IntelLogBottomNav.tsx:21`
- `components/LogbookBottomNav.tsx:47`
- `components/adminlog/AdminLogBottomNav.tsx:16`

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 4: Manual visual check (v1 no-op)**

Run: `npm run dev`, open any app (e.g. `/homelog`), confirm the bottom nav pill looks pixel-identical to before (translucent dark pill, hairline white rim, blurred).

- [ ] **Step 5: Commit**

```bash
git add lib/ui/navShell.ts components/BottomNav.tsx components/HomeLogBottomNav.tsx components/MoneyLogBottomNav.tsx components/WatchLogBottomNav.tsx components/TravelLogBottomNav.tsx components/SocialLogBottomNav.tsx components/TaskLogBottomNav.tsx components/LearnLogBottomNav.tsx components/ShoppingLogBottomNav.tsx components/IntelLogBottomNav.tsx components/LogbookBottomNav.tsx components/adminlog/AdminLogBottomNav.tsx
git commit -m "refactor: consolidate bottom-nav shell class, route through .surface-nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Card

**Files:**
- Modify: `components/ui/card.tsx:26-42`

**Interfaces:**
- Consumes: `.surface-card` class from Task 4.

- [ ] **Step 1: Update the Card root className**

In `components/ui/card.tsx`, change:

```typescript
      className={cn(
        "relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        cardVariants({ glassSize }),
        className
      )}
```

to:

```typescript
      className={cn(
        "relative flex flex-col border text-card-foreground surface-card",
        cardVariants({ glassSize }),
        className
      )}
```

(`rounded-xl`/`bg-card`/`shadow-sm` are dropped — `.surface-card` now supplies background, border color, radius, shadow, and blur; the `border` utility stays for border-width.)

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual visual check (v1 no-op)**

Run: `npm run dev`, open any page with cards (e.g. `/profile`), confirm cards look pixel-identical to before.

- [ ] **Step 4: Commit**

```bash
git add components/ui/card.tsx
git commit -m "refactor(ui): route Card surface through --surface-card-* tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Button

**Files:**
- Modify: `components/ui/button.tsx:9-38`

**Interfaces:**
- Consumes: `.surface-button-chrome`, `.surface-button-elevated` classes from Task 4.

Scope refinement from the spec: `outline` is the one true "chrome" (bordered/transparent) variant and gets the full glass swap. `default`/`destructive`/`secondary` are solid color fills in this codebase (not bordered chrome) — they keep their brand-color background in both versions and only gain elevation via `.surface-button-elevated` (v1 = today's `shadow-xs`, v2 = `shadow-glass`). `ghost`/`link` are untouched — a ghost button is meant to stay invisible at rest in both versions.

- [ ] **Step 1: Update `buttonVariants`**

In `components/ui/button.tsx`, change the `variants.variant` object from:

```typescript
      variants: {
        variant: {
          default:
            "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
          destructive:
            "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
          outline:
            "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
          secondary:
            "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
          ghost:
            "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          link: "text-primary underline-offset-4 hover:underline",
        },
```

to:

```typescript
      variants: {
        variant: {
          default:
            "surface-button-elevated bg-primary text-primary-foreground hover:bg-primary/90",
          destructive:
            "surface-button-elevated bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
          outline:
            "surface-button-chrome border hover:bg-accent hover:text-accent-foreground",
          secondary:
            "surface-button-elevated bg-secondary text-secondary-foreground hover:bg-secondary/80",
          ghost:
            "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          link: "text-primary underline-offset-4 hover:underline",
        },
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual visual check (v1 no-op)**

Run: `npm run dev`, check `default`, `outline`, and `secondary` buttons on any page (e.g. `/adminlog/card-glow` has both variants) — pixel-identical to before.

- [ ] **Step 4: Commit**

```bash
git add components/ui/button.tsx
git commit -m "refactor(ui): route Button surfaces through --surface-button-* tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Input

**Files:**
- Modify: `components/ui/input.tsx:5-19`

**Interfaces:**
- Consumes: `.surface-input` class from Task 4.

- [ ] **Step 1: Update the Input className**

In `components/ui/input.tsx`, change:

```typescript
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
```

to:

```typescript
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground surface-input flex h-9 w-full min-w-0 border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
```

(`dark:bg-input/30`/`border-input`/`bg-transparent`/`rounded-md` dropped — `.surface-input` now supplies background, border color, and radius.)

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual visual check (v1 no-op)**

Run: `npm run dev`, check any form input (e.g. `/profile`) — pixel-identical to before, light and dark mode.

- [ ] **Step 4: Commit**

```bash
git add components/ui/input.tsx
git commit -m "refactor(ui): route Input surface through --surface-input-* tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: AdminLog toggle page

**Files:**
- Create: `app/(adminlog)/adminlog/ui-version/page.tsx`
- Modify: `lib/adminlog/nav.ts` (add nav entry in the `ui-themes` category, and import a new icon)

**Interfaces:**
- Consumes: `UI_VERSION_KEY`, `fetchUiVersion` from `@/lib/theme/uiVersion`; `useRequireAdmin` from `@/lib/adminlog/useRequireAdmin`; `Switch` from `@/components/ui/switch`.

- [ ] **Step 1: Write the admin page**

```typescript
// app/(adminlog)/adminlog/ui-version/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UI_VERSION_KEY } from '@/lib/theme/uiVersion';

export default function UiVersionPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/ui-version');
      if (res.ok) {
        const data = await res.json();
        setEnabled(Boolean(data.enabled));
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  async function toggle(next: boolean) {
    setEnabled(next);
    setSaving(true);
    await apiFetch('/api/adminlog/ui-version', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    setSaving(false);
    // Every consumer (UiVersionSettingsEffect, this page) shares this SWR
    // key — revalidate so the change is visible immediately instead of
    // waiting out the 60s dedupingInterval.
    mutate(UI_VERSION_KEY);
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Switches Button, Card, Input, and the bottom nav between today&apos;s flat look and a glass look
        (translucent, blurred surfaces) app-wide. Global only — no per-app override. Per-app accent colors are
        unaffected either way.
      </p>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-0.5">
            <Label htmlFor="ui-v2">UI v2 (Beta)</Label>
            <p className="text-sm text-muted-foreground">
              {enabled ? 'Glass surfaces are live app-wide.' : "Off — today's flat look."}
            </p>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Switch id="ui-v2" checked={enabled} disabled={saving} onCheckedChange={toggle} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav entry**

In `lib/adminlog/nav.ts`, add `Droplets` to the lucide-react import list (alongside `SwatchBook`), then add this entry to the `ui-themes` category's `items` array, right after the `card-glow` entry:

```typescript
      { href: '/adminlog/ui-version', label: 'UI v2 (Beta)', description: 'Switch Button/Card/Input/bottom-nav between the flat look and the glass look, app-wide.', icon: Droplets },
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 4: Manual end-to-end check**

Run: `npm run dev`, sign in as an admin, open `/adminlog/ui-version`, flip the switch on. Reload any page (e.g. `/homelog`) and confirm Button/Card/Input/bottom-nav now render with blurred/translucent glass surfaces while per-app accent colors (primary buttons, etc.) are unchanged. Flip it back off and confirm everything returns to exactly how it looked before this plan started.

- [ ] **Step 5: Commit**

```bash
git add "app/(adminlog)/adminlog/ui-version" lib/adminlog/nav.ts
git commit -m "feat(adminlog): add UI v2 (Beta) toggle page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `route.test.ts`.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: builds cleanly with no type or lint errors.

- [ ] **Step 3: Push**

```bash
git push
```
