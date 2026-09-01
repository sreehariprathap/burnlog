# TravelLog Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TravelLog as the eighth LogBook sub-app: a visit log + Snapchat-Maps-style exploration map, with Home/Map/Config tabs working end-to-end and Plan/Suggestions tabs present as placeholders for two follow-on specs.

**Architecture:** New Prisma model `TravelVisit` (table `travellog_visits`, RLS matching every other per-profile table). New route group `app/(travellog)/` following the exact scaffolding pattern used by TaskLog/MoneyLog (own layout, bottom nav, mark, config page). The map is Aceternity UI's `world-map.tsx` component, ported into `components/ui/world-map.tsx` and adapted to this repo's own `useTheme` hook, extended with a `hotspots` prop for multi-day stays. Coordinates come from OpenStreetMap Nominatim (free, no API key) since no Maps key exists in this project yet.

**Tech Stack:** Next.js App Router client components, `@supabase/ssr` browser client, Prisma (schema-as-documentation; migration applied directly via Supabase), SWR for data fetching, `dotted-map` (new dependency) + `motion` (already installed) for the map.

**Spec:** `docs/superpowers/specs/2026-09-01-travellog-foundation-design.md`

## Global Constraints

- No test framework exists in this repo (`package.json` has no `test` script) — verification is `npx tsc --noEmit` + `npm run lint` clean, plus manual browser checks, matching the bar used in `docs/superpowers/plans/2026-08-31-tasklog-cost-moneylog.md`. Do not add a test runner as part of this plan.
- Table/column naming: table `travellog_visits`, columns in camelCase (`profileId`, `arrivalDate`, etc.) — matches every existing table (`finance_transactions`, `tasklog_tasks`).
- RLS: enable `ROW LEVEL SECURITY` on `travellog_visits` and add a single `ALL` policy scoped to `profiles.userId = auth.uid()`, exact pattern copied from `finance_transactions_owner_access` (verified via `pg_policies` against the live project).
- "Explored" (hotspot) status is derived, never stored: `departureDate != null && departureDate >= arrivalDate + 1 day`.
- No onboarding flow, no photo upload, no AI planning, no holiday/income-based suggestions — out of scope for this plan (see spec's Non-goals).
- Follow the existing app-scaffolding pattern exactly: every new file mirrors an equivalent TaskLog/MoneyLog file 1:1 in structure.

---

### Task 1: Database — create `travellog_visits` and update Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (add `TravelVisit` model, add relation field on `Profile`)

**Interfaces:**
- Produces: `travellog_visits` table (columns: `id`, `profileId`, `placeName`, `country`, `lat`, `lng`, `arrivalDate`, `departureDate`, `notes`, `createdAt`). Task 3's `TravelVisitRow` type and every later task's Supabase queries depend on these exact column names.

- [ ] **Step 1: Apply the migration to the live Supabase project**

Use the `mcp__supabase__apply_migration` tool with name `create_travellog_visits` and this SQL:

```sql
create table travellog_visits (
  id uuid primary key default gen_random_uuid(),
  "profileId" uuid not null references profiles(id),
  "placeName" text not null,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  "arrivalDate" date not null,
  "departureDate" date,
  notes text,
  "createdAt" timestamp without time zone not null default now()
);

create index travellog_visits_profile_id_idx on travellog_visits ("profileId");

alter table travellog_visits enable row level security;

create policy travellog_visits_owner_access on travellog_visits
  for all
  using (exists (
    select 1 from profiles
    where profiles.id = travellog_visits."profileId"
      and profiles."userId" = auth.uid()
  ))
  with check (exists (
    select 1 from profiles
    where profiles.id = travellog_visits."profileId"
      and profiles."userId" = auth.uid()
  ));
```

- [ ] **Step 2: Verify the table and policy exist**

Use `mcp__supabase__execute_sql` with:
```sql
select relname, relrowsecurity from pg_class where relname = 'travellog_visits';
select policyname from pg_policies where tablename = 'travellog_visits';
```
Expected: one row with `relrowsecurity = true`, one policy named `travellog_visits_owner_access`.

- [ ] **Step 3: Update `prisma/schema.prisma`**

Find the `Profile` model's relation list (the block of `Xyz  Xyz[]` lines before its closing brace, e.g. near `TaskGoal  TaskGoal[]`) and add:

```prisma
  TravelVisit    TravelVisit[]
```

Then add a new model, placed after the `Task` model (which ends `@@map("tasklog_tasks")`):

```prisma
/// a single logged travel stop — a place visited, with optional stay length; "explored" (multi-day) status is derived at read time, not stored
model TravelVisit {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile       Profile   @relation(fields: [profileId], references: [id])
  profileId     String    @db.Uuid
  placeName     String
  country       String
  lat           Float
  lng           Float
  arrivalDate   DateTime  @db.Date
  departureDate DateTime? @db.Date
  notes         String?
  createdAt     DateTime  @default(now())

  @@map("travellog_visits")
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors. If Prisma Client types are used elsewhere and need regenerating, run `npx prisma generate`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(travellog): add travellog_visits table and Prisma schema"
```

---

### Task 2: Register TravelLog in the app registry and shared chrome

**Files:**
- Modify: `lib/appMode.ts`
- Modify: `app/globals.css`
- Create: `components/TravelLogMark.tsx`
- Modify: `components/TopBar.tsx`
- Modify: `components/AppSwitcher.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `AppId` now includes `'travellog'`; `APPS.travellog` (`home: '/travellog'`, `themeClass: 'app-travellog'`); `TravelLogMark` component (`size?: number; className?: string`). Every later task's layout/nav files import these.

- [ ] **Step 1: Add `travellog` to `AppId`, `isAppId`, and `APPS`**

In `lib/appMode.ts`, change:

```ts
export type AppId = 'logbook' | 'burnlog' | 'moneylog' | 'tasklog' | 'homelog' | 'sociallog' | 'shoppinglog';
```

to:

```ts
export type AppId = 'logbook' | 'burnlog' | 'moneylog' | 'tasklog' | 'homelog' | 'sociallog' | 'shoppinglog' | 'travellog';
```

Add a new entry to `APPS` (after the `shoppinglog` entry, before the closing `};`):

```ts
  travellog: {
    id: 'travellog',
    name: 'TravelLog',
    tagline: "Track everywhere you've been",
    home: '/travellog',
    themeClass: 'app-travellog',
  },
```

In `isAppId`, add `|| val === 'travellog'` to the existing chain of `||` comparisons before the closing `);`.

- [ ] **Step 2: Add the TravelLog theme block to `app/globals.css`**

Find the `.app-tasklog { ... }` and `.app-tasklog.dark { ... }` blocks (around line 317 and 357). Add a new pair immediately after `.app-tasklog.dark`'s closing brace, using an unused hue (orange/amber, `oklch` hue ~70) so it's visually distinct from every existing app:

```css
.app-travellog {
  --background: #fdf8f3;
  --foreground: oklch(0.32 0.06 55);
  --card: #fdf8f3;
  --card-foreground: oklch(0.32 0.06 55);
  --popover: #fdf8f3;
  --popover-foreground: oklch(0.32 0.06 55);
  --primary: oklch(0.62 0.17 55);
  --primary-foreground: #fdf8f3;
  --secondary: oklch(0.5 0.13 55);
  --secondary-foreground: #fdf8f3;
  --muted: oklch(0.92 0.03 60);
  --muted-foreground: oklch(0.45 0.06 55);
  --accent: oklch(0.83 0.07 60);
  --accent-foreground: oklch(0.32 0.06 55);
  --destructive: oklch(0.577 0.245 27.325);
}

.app-travellog.dark {
  --background: oklch(0.22 0.03 55);
  --foreground: #fdf6ef;
  --card: oklch(0.28 0.04 55);
  --card-foreground: #fdf6ef;
  --popover: oklch(0.28 0.04 55);
  --popover-foreground: #fdf6ef;
  --primary: oklch(0.68 0.16 55);
  --primary-foreground: oklch(0.2 0.03 55);
  --secondary: oklch(0.5 0.13 55);
  --secondary-foreground: #fdf6ef;
  --muted: oklch(0.3 0.04 55);
  --muted-foreground: oklch(0.75 0.05 60);
  --accent: oklch(0.4 0.08 60);
  --accent-foreground: #fdf6ef;
  --destructive: oklch(0.704 0.191 22.216);
}
```

- [ ] **Step 3: Create `components/TravelLogMark.tsx`**

```tsx
// components/TravelLogMark.tsx
import { cn } from '@/lib/utils';

interface TravelLogMarkProps {
  size?: number;
  className?: string;
}

// Fixed amber, independent of the ambient theme — see TaskLogMark for why.
export function TravelLogMark({ size = 20, className }: TravelLogMarkProps) {
  return (
    <span
      className={cn('inline-flex items-center justify-center font-black leading-none text-amber-500', className)}
      style={{ width: size, height: size, fontSize: size * 1.6 }}
      aria-hidden="true"
    >
      V
    </span>
  );
}
```

- [ ] **Step 4: Wire `TravelLogMark` into `TopBar.tsx`**

In `components/TopBar.tsx`, add the import alongside the other mark imports:

```ts
import { TravelLogMark } from './TravelLogMark';
```

In the `activeApp === '...' ? (...)` chain inside the switcher button, add a new branch before the final `BurnLogMark` fallback:

```tsx
          ) : activeApp === 'shoppinglog' ? (
            <ShoppingLogMark size={20} />
          ) : activeApp === 'travellog' ? (
            <TravelLogMark size={20} />
          ) : (
```

- [ ] **Step 5: Wire `TravelLogMark` into `AppSwitcher.tsx`**

In `components/AppSwitcher.tsx`, add the import alongside the other mark imports:

```ts
import { TravelLogMark } from '@/components/TravelLogMark';
```

In the `AppIcon` function's `switch`, add a case before `default`:

```ts
    case 'travellog':
      return <TravelLogMark size={size} />;
```

- [ ] **Step 6: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 7: Commit**

```bash
git add lib/appMode.ts app/globals.css components/TravelLogMark.tsx components/TopBar.tsx components/AppSwitcher.tsx
git commit -m "feat(travellog): register TravelLog in the app registry, theme, and switcher"
```

---

### Task 3: TravelLog data types and Nominatim geocoding helper

**Files:**
- Create: `lib/travellog/types.ts`
- Create: `lib/travellog/geocode.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TravelVisitRow` (`id`, `profileId`, `placeName`, `country`, `lat`, `lng`, `arrivalDate`, `departureDate`, `notes`, `createdAt` — mirrors Task 1's columns exactly), `isExplored(visit: TravelVisitRow): boolean`, `geocodePlace(query: string): Promise<GeocodeResult | null>` where `GeocodeResult = { lat: number; lng: number; displayName: string }`. Tasks 6 and 7 consume all of these by exact name.

- [ ] **Step 1: Write `lib/travellog/types.ts`**

```ts
// lib/travellog/types.ts

export interface TravelVisitRow {
  id: string;
  profileId: string;
  placeName: string;
  country: string;
  lat: number;
  lng: number;
  arrivalDate: string;       // 'YYYY-MM-DD'
  departureDate: string | null; // 'YYYY-MM-DD', null = single-day visit
  notes: string | null;
  createdAt: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A visit counts as "explored" (multi-day hotspot) once the stay spans at least one full day. */
export function isExplored(visit: TravelVisitRow): boolean {
  if (!visit.departureDate) return false;
  const arrival = new Date(visit.arrivalDate).getTime();
  const departure = new Date(visit.departureDate).getTime();
  return departure - arrival >= MS_PER_DAY;
}
```

- [ ] **Step 2: Write `lib/travellog/geocode.ts`**

```ts
// lib/travellog/geocode.ts

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Looks up a place name via OpenStreetMap's Nominatim (free, no API key).
 * Returns the single best match, or null if nothing was found or the
 * request failed — callers fall back to manual lat/lng entry either way.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const first = results[0];
    if (!first) return null;

    return {
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName: first.display_name,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/travellog/types.ts lib/travellog/geocode.ts
git commit -m "feat(travellog): add TravelVisit types and Nominatim geocoding helper"
```

---

### Task 4: Port the World Map component

**Files:**
- Create: `components/ui/world-map.tsx`

**Interfaces:**
- Consumes: `useTheme` from `@/components/ThemeProvider` (existing, `{ theme: 'light' | 'dark' | 'system' }`).
- Produces: default-exported `WorldMap` component, props `{ dots?: Array<{ start: {lat,lng,label?}; end: {lat,lng,label?} }>; hotspots?: Array<{lat,lng,label?}>; lineColor?: string }`. Task 7 renders this with real data.

- [ ] **Step 1: Install `dotted-map`**

Run: `npm install dotted-map`
Expected: added to `package.json` dependencies (`motion` is already present at `^13.1.1`, no change needed there).

- [ ] **Step 2: Write `components/ui/world-map.tsx`**

Ported from Aceternity UI's World Map component (`https://ui.aceternity.com/components/world-map`), adapted to use this repo's own theme hook instead of `next-themes`, and extended with a `hotspots` prop that reuses the same `projectPoint` projection to render larger pulsing markers for multi-day stays:

```tsx
// components/ui/world-map.tsx
'use client';

import { useRef } from 'react';
import { motion } from 'motion/react';
import DottedMap from 'dotted-map';

import { useTheme } from '@/components/ThemeProvider';

interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface MapProps {
  dots?: Array<{ start: MapPoint; end: MapPoint }>;
  hotspots?: MapPoint[];
  lineColor?: string;
}

export default function WorldMap({ dots = [], hotspots = [], lineColor = '#0ea5e9' }: MapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const map = new DottedMap({ height: 100, grid: 'diagonal' });

  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const svgMap = map.getSVG({
    radius: 0.22,
    color: isDark ? '#FFFFFF40' : '#00000040',
    shape: 'circle',
    backgroundColor: isDark ? 'black' : 'white',
  });

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 50;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  return (
    <div className="w-full aspect-[2/1] dark:bg-black bg-white rounded-lg relative font-sans">
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] pointer-events-none select-none"
        alt="world map"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg ref={svgRef} viewBox="0 0 800 400" className="w-full h-full absolute inset-0 pointer-events-none select-none">
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.5 * i, ease: 'easeOut' }}
              />
            </g>
          );
        })}

        <defs>
          <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {dots.map((dot, i) => (
          <g key={`points-group-${i}`}>
            <g key={`start-${i}`}>
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r="2" fill={lineColor} />
              <circle cx={projectPoint(dot.start.lat, dot.start.lng).x} cy={projectPoint(dot.start.lat, dot.start.lng).y} r="2" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
            <g key={`end-${i}`}>
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r="2" fill={lineColor} />
              <circle cx={projectPoint(dot.end.lat, dot.end.lng).x} cy={projectPoint(dot.end.lat, dot.end.lng).y} r="2" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="2" to="8" dur="1.5s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>
        ))}

        {hotspots.map((point, i) => {
          const { x, y } = projectPoint(point.lat, point.lng);
          return (
            <g key={`hotspot-${i}`}>
              <circle cx={x} cy={y} r="5" fill={lineColor} stroke="white" strokeWidth="1.5" />
              <circle cx={x} cy={y} r="5" fill={lineColor} opacity="0.5">
                <animate attributeName="r" from="5" to="16" dur="1.8s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" begin="0s" repeatCount="indefinite" />
              </circle>
              {point.label && (
                <text x={x} y={y - 10} textAnchor="middle" fontSize="8" fill={lineColor} className="font-medium">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings. (Visual verification of rendering happens in Task 7, once real data flows into it.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/ui/world-map.tsx
git commit -m "feat(travellog): port Aceternity World Map component with hotspot markers"
```

---

### Task 5: TravelLog route group layout and bottom nav

**Files:**
- Create: `app/(travellog)/layout.tsx`
- Create: `components/TravelLogBottomNav.tsx`

**Interfaces:**
- Consumes: `setActiveApp` from `@/lib/appMode` (Task 2), `TravelLogMark` (Task 2), `ConfigMenu` from `@/components/ConfigMenu` (existing).
- Produces: `TravelLogLayout` (route group layout, applied automatically by Next.js to every route under `app/(travellog)/`), `TravelLogBottomNav` component (no props). Tasks 6–8 render `TravelLogBottomNav` on every page.

- [ ] **Step 1: Write `app/(travellog)/layout.tsx`**

```tsx
// app/(travellog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function TravelLogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-logbook');
    document.documentElement.classList.remove('app-moneylog');
    document.documentElement.classList.remove('app-tasklog');
    document.documentElement.classList.remove('app-homelog');
    document.documentElement.classList.remove('app-sociallog');
    document.documentElement.classList.remove('app-shoppinglog');
    document.documentElement.classList.add('app-travellog');
    setActiveApp('travellog');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: Write `components/TravelLogBottomNav.tsx`**

```tsx
// components/TravelLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { MapIcon, SparklesIcon, PiggyBankIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TravelLogMark } from '@/components/TravelLogMark';
import { ConfigMenu } from '@/components/ConfigMenu';

const tabs = [
  { href: '/travellog', label: 'Home', Icon: null },
  { href: '/travellog/map', label: 'Map', Icon: MapIcon },
  { href: '/travellog/plan', label: 'Plan', Icon: SparklesIcon },
  { href: '/travellog/suggestions', label: 'Suggest', Icon: PiggyBankIcon },
];

export function TravelLogBottomNav() {
  const pathname = usePathname();
  const isConfigActive = pathname === '/travellog/config' || pathname.startsWith('/travellog/config/');

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = href === '/travellog' ? pathname === href : pathname.startsWith(href + '/') || pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="travellog-bottom-nav-active"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {Icon ? (
              <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            ) : (
              <TravelLogMark size={20} className="relative z-10 mb-0.5" />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
      <ConfigMenu href="/travellog/config" isActive={isConfigActive} navId="travellog-bottom-nav-active" />
    </nav>
  );
}
```

- [ ] **Step 3: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/layout.tsx" components/TravelLogBottomNav.tsx
git commit -m "feat(travellog): add route group layout and bottom nav"
```

---

### Task 6: Home tab

**Files:**
- Create: `app/(travellog)/travellog/page.tsx`

**Interfaces:**
- Consumes: `useCurrentProfile` (`@/lib/useCurrentProfile`, existing), `TravelVisitRow`, `isExplored` (Task 3), `TravelLogBottomNav` (Task 5), `TopBar` (`@/components/TopBar`, existing).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Write `app/(travellog)/travellog/page.tsx`**

```tsx
// app/(travellog)/travellog/page.tsx
'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';

async function fetchVisits(profileId: string): Promise<TravelVisitRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export default function TravelLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data: visits, isLoading } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );

  const loading = profileLoading || isLoading;
  const totalVisits = visits?.length ?? 0;
  const countries = new Set((visits ?? []).map((v) => v.country)).size;
  const exploredCount = (visits ?? []).filter(isExplored).length;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="TravelLog" />
      <div className="p-4 flex flex-col gap-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6 grid grid-cols-3 gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold">{totalVisits}</p>
                <p className="text-xs text-muted-foreground">Visits</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{countries}</p>
                <p className="text-xs text-muted-foreground">Countries</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{exploredCount}</p>
                <p className="text-xs text-muted-foreground">Explored</p>
              </div>
            </CardContent>
          </Card>
        )}
        {!loading && totalVisits === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No trips logged yet. Head to the Map tab to log your first visit.
            </CardContent>
          </Card>
        )}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "app/(travellog)/travellog/page.tsx"
git commit -m "feat(travellog): add Home tab with visit stats"
```

---

### Task 7: Map tab and log-a-visit form

**Files:**
- Create: `app/(travellog)/travellog/map/page.tsx`
- Create: `app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx`

**Interfaces:**
- Consumes: `WorldMap` (Task 4, default export), `TravelVisitRow`, `isExplored` (Task 3), `geocodePlace`, `GeocodeResult` (Task 3), `useCurrentProfile` (existing), `useToast` (`@/components/ui/use-toast`, existing).
- Produces: nothing consumed by later tasks (leaf page + its form).

- [ ] **Step 1: Write `app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx`**

```tsx
// app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { geocodePlace } from '@/lib/travellog/geocode';

type LogVisitDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LogVisitDrawer({ profileId, open, onOpenChange, onSaved }: LogVisitDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [placeName, setPlaceName] = useState('');
  const [country, setCountry] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departureDate, setDepartureDate] = useState('');
  const [notes, setNotes] = useState('');
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);

  function reset() {
    setPlaceName('');
    setCountry('');
    setLat('');
    setLng('');
    setArrivalDate(new Date().toISOString().slice(0, 10));
    setDepartureDate('');
    setNotes('');
    setPlaceError(null);
    setCoordError(null);
  }

  async function handleLookup() {
    if (!placeName.trim()) return;
    setLooking(true);
    try {
      const result = await geocodePlace(country.trim() ? `${placeName}, ${country}` : placeName);
      if (result) {
        setLat(String(result.lat));
        setLng(String(result.lng));
        setCoordError(null);
      } else {
        setCoordError('No match found — enter latitude/longitude manually');
      }
    } finally {
      setLooking(false);
    }
  }

  async function handleSave() {
    setPlaceError(null);
    setCoordError(null);

    if (!placeName.trim()) {
      setPlaceError('Place name is required');
      return;
    }
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!lat || !lng || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setCoordError('Look up the place or enter latitude/longitude manually');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('travellog_visits').insert({
        profileId,
        placeName: placeName.trim(),
        country: country.trim() || 'Unknown',
        lat: parsedLat,
        lng: parsedLng,
        arrivalDate,
        departureDate: departureDate || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast({ description: `Logged ${placeName.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save visit', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log a visit</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="placeName">Place</Label>
            <div className="flex gap-2">
              <Input id="placeName" value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="e.g. Kyoto" />
              <Button type="button" variant="outline" onClick={handleLookup} disabled={looking || !placeName.trim()}>
                {looking ? 'Looking…' : 'Look up'}
              </Button>
            </div>
            {placeError && <p className="text-red-500 text-xs">{placeError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Japan" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          {coordError && <p className="text-red-500 text-xs">{coordError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="arrivalDate">Arrival</Label>
              <Input id="arrivalDate" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="departureDate">Departure (optional)</Label>
              <Input id="departureDate" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save visit'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Write `app/(travellog)/travellog/map/page.tsx`**

```tsx
// app/(travellog)/travellog/map/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';
import { LogVisitDrawer } from './_components/LogVisitDrawer';
import WorldMap from '@/components/ui/world-map';

async function fetchVisits(profileId: string): Promise<TravelVisitRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export default function TravelLogMapPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );

  const sorted = visits ?? [];
  const dots = sorted.slice(1).map((visit, i) => ({
    start: { lat: sorted[i].lat, lng: sorted[i].lng, label: sorted[i].placeName },
    end: { lat: visit.lat, lng: visit.lng, label: visit.placeName },
  }));
  const hotspots = sorted.filter(isExplored).map((v) => ({ lat: v.lat, lng: v.lng, label: v.placeName }));

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        title="Map"
        actions={
          <Button size="sm" onClick={() => setDrawerOpen(true)} disabled={!profile}>
            Log a visit
          </Button>
        }
      />
      <div className="p-4 flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="w-full aspect-[2/1] rounded-lg" />
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No visits logged yet. Tap "Log a visit" to add your first one.
            </CardContent>
          </Card>
        ) : (
          <WorldMap dots={dots} hotspots={hotspots} />
        )}
        <div className="flex flex-col gap-2">
          {sorted.slice().reverse().map((visit) => (
            <Card key={visit.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{visit.placeName}, {visit.country}</p>
                  <p className="text-xs text-muted-foreground">
                    {visit.arrivalDate}{visit.departureDate ? ` – ${visit.departureDate}` : ''}
                    {isExplored(visit) ? ' · Explored' : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {profile && (
        <LogVisitDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add "app/(travellog)/travellog/map"
git commit -m "feat(travellog): add Map tab with world map and log-a-visit form"
```

---

### Task 8: Config page and Plan/Suggestions placeholders

**Files:**
- Create: `app/(travellog)/travellog/config/page.tsx`
- Create: `app/(travellog)/travellog/plan/page.tsx`
- Create: `app/(travellog)/travellog/suggestions/page.tsx`

**Interfaces:**
- Consumes: `AppConfigShell` (`@/components/AppConfigShell`, existing), `TravelLogBottomNav` (Task 5), `TopBar` (existing).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `app/(travellog)/travellog/config/page.tsx`**

```tsx
// app/(travellog)/travellog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';

export default function TravelLogConfigPage() {
  return (
    <AppConfigShell
      appName="TravelLog"
      exportData={() => ({})}
      bottomNav={<TravelLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TravelLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No TravelLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
```

- [ ] **Step 2: Write `app/(travellog)/travellog/plan/page.tsx`**

```tsx
// app/(travellog)/travellog/plan/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';

export default function TravelLogPlanPage() {
  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Plan" />
      <div className="p-4">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            AI-assisted trip planning (IceMyVacation) is coming soon.
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Write `app/(travellog)/travellog/suggestions/page.tsx`**

```tsx
// app/(travellog)/travellog/suggestions/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';

export default function TravelLogSuggestionsPage() {
  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Suggestions" />
      <div className="p-4">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            Affordable trip suggestions are coming soon.
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Verify types compile and lint is clean**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors or warnings.

- [ ] **Step 5: Commit**

```bash
git add "app/(travellog)/travellog/config" "app/(travellog)/travellog/plan" "app/(travellog)/travellog/suggestions"
git commit -m "feat(travellog): add Config page and Plan/Suggestions placeholders"
```

---

### Task 9: Documentation and full verification

**Files:**
- Create: `app/(travellog)/README.md`
- Modify: `README.md` (root)

**Interfaces:** None (documentation + verification only).

- [ ] **Step 1: Write `app/(travellog)/README.md`**

```markdown
# TravelLog

Travel-tracking sub-app. One of eight sub-apps under LogBook — see the
[root README](../../README.md) for how it fits into the wider app.

## What it does

- **Home** (`/travellog`) — visit stats (total visits, countries,
  explored stops).
- **Map** (`/travellog/map`) — Snapchat-Maps-style exploration map
  (Aceternity World Map, ported into `components/ui/world-map.tsx`)
  plus the "Log a visit" form. Visits are connected in chronological
  order; stays of a full day or more render as a pulsing hotspot.
- **Plan** (`/travellog/plan`) — placeholder for the IceMyVacation
  AI trip planner (separate spec).
- **Suggestions** (`/travellog/suggestions`) — placeholder for
  affordable-trip suggestions (separate spec).
- **Config** (`/travellog/config`) — TravelLog-specific settings. No
  dedicated onboarding flow yet.

## Routes

```
/travellog              Home
/travellog/map            Map + log a visit
/travellog/plan              Plan (placeholder)
/travellog/suggestions          Suggestions (placeholder)
/travellog/config                  Settings
```

## Data model

Prisma model: `TravelVisit` (table `travellog_visits`). Shares the
top-level `Profile` model with every other app. "Explored" (multi-day
stay) status is derived at read time via `isExplored()` in
`lib/travellog/types.ts`, never stored.

## Key files

```
app/(travellog)/
  layout.tsx                Route-group layout/theming
  travellog/page.tsx           Home
  travellog/map/                 Map + log-a-visit form
  travellog/plan/                   Plan (placeholder)
  travellog/suggestions/               Suggestions (placeholder)
  travellog/config/                       Settings
components/TravelLogBottomNav.tsx      TravelLog's bottom nav
components/TravelLogMark.tsx              TravelLog's app icon
components/ui/world-map.tsx                  Ported map component
lib/travellog/                                  TravelLog-specific helpers
```
```

- [ ] **Step 2: Update root `README.md`**

Read `README.md` first to find the apps table (the row list including `| **TaskLog** | ...`), the directory-group list (`app/(logbook)`, `app/(burnlog)`, ...), and the directory tree (`(tasklog)/tasklog/  TaskLog — see ...`). Add TravelLog consistently in all three places:

- Apps table: add a row `| **TravelLog** | `/travellog` | Travel tracking: visit log, exploration map, AI-assisted trip planning | [`app/(travellog)/README.md`](app/(travellog)/README.md) |` after the TaskLog row.
- Directory-group list: add `` `app/(travellog)` `` to the list of route groups.
- Directory tree: add `  (travellog)/travellog/   TravelLog — see app/(travellog)/README.md` after the TaskLog line.

- [ ] **Step 3: Full type-check and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors; only the two pre-existing warnings from before this plan started (`goals/page.tsx` and `IdeaBreakdownReviewSheet.tsx` missing-dependency warnings).

- [ ] **Step 4: Manual verification**

Run `npm run dev`, then in the browser:
1. Open the app switcher (tap the app icon in the TopBar) — confirm TravelLog appears with its amber "V" mark.
2. Navigate to `/travellog` — confirm the Home tab loads with 0/0/0 stats and the empty-state message.
3. Navigate to `/travellog/map`, tap "Log a visit", enter a place name (e.g. "Paris"), tap "Look up" — confirm lat/lng populate. Set arrival date only (no departure), save — confirm it appears as a plain dot on the map with no hotspot.
4. Log a second visit with both arrival and a departure date at least a day later — confirm it renders as a pulsing hotspot, and a connecting line is drawn between the first and second visit.
5. Log a third visit dated *before* the first one — confirm the connecting path re-orders to visit chronologically (earliest → latest) regardless of the order logged.
6. Navigate to `/travellog/plan` and `/travellog/suggestions` — confirm each shows its placeholder card.
7. Navigate to `/travellog/config` — confirm the settings shell renders.

- [ ] **Step 5: Commit**

```bash
git add "app/(travellog)/README.md" README.md
git commit -m "docs(travellog): add app README and register in root README"
```
