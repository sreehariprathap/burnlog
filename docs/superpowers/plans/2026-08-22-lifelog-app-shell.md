# LifeLog App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, linearly (no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn BurnLog into a two-app shell (BurnLog + LifeLog) with route-group isolation, per-app theming, a bottom-sheet app switcher, namespaced localStorage with safe wipe-on-switch, and a localStorage-based default boot app.

**Architecture:** BurnLog routes move into a `(burnlog)` route group (URL-transparent — no link changes); a new `(lifelog)` route group hosts a placeholder `/lifelog` page. A pure module `lib/appMode.ts` owns the app registry and namespaced storage. A root-level React context (`AppSwitchProvider`) survives navigation across route groups and drives a full-screen `SwitchLoader`. Theming is layered on top of the existing light/dark system via a second CSS class (`.app-lifelog`) that overrides the same design tokens BurnLog already uses, so no component markup changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4 (CSS custom properties), vaul (`Drawer`), Radix `Switch`, lucide-react icons, Supabase auth helpers (unchanged).

## Global Constraints

- Route groups are URL-transparent — every existing BurnLog URL (`/dashboard`, `/goals`, `/session`, `/insights`, `/profile`) must be unchanged after the move.
- `wipeAppStorage(app)` must only ever delete keys prefixed `${app}:` and must never delete keys prefixed `app:` (protected), Supabase auth keys (`sb-*`), or the existing theme key (`burnlog-theme`).
- No new test framework is introduced (none exists in this repo — `ts-node` is the only runner available). Verification uses a plain `ts-node`-run assertion script (`lib/appMode.selftest.ts`), not vitest/jest.
- No new npm dependencies — vaul (`Drawer`), Radix `Switch`, and lucide-react are already installed and already have thin wrappers in `components/ui/`.
- No LifeLog product features (expenses, budgets, grocery, etc.) — this plan builds the shell and a placeholder `/lifelog` page only.
- `L.png` does not exist in `public/`; use the lucide `Wallet` icon as LifeLog's logo/mark everywhere a BurnLog flow uses `/B.png`, per the spec's fallback.

---

### Task 1: `lib/appMode.ts` — app registry, namespaced storage, safe wipe

**Files:**
- Create: `lib/appMode.ts`
- Create: `lib/appMode.selftest.ts`

**Interfaces:**
- Produces (used by every later task):
  - `type AppId = 'burnlog' | 'lifelog'`
  - `interface AppMeta { id: AppId; name: string; tagline: string; home: string; themeClass?: string }`
  - `const APPS: Record<AppId, AppMeta>`
  - `const DEFAULT_APP_KEY = 'app:defaultApp'`
  - `const ACTIVE_APP_KEY = 'app:activeApp'`
  - `function nsKey(app: AppId, key: string): string`
  - `function nsGet(app: AppId, key: string): string | null`
  - `function nsSet(app: AppId, key: string, val: string): void`
  - `function nsRemove(app: AppId, key: string): void`
  - `function getDefaultApp(): AppId`
  - `function setDefaultApp(app: AppId): void`
  - `function getActiveApp(): AppId`
  - `function setActiveApp(app: AppId): void`
  - `function wipeAppStorage(app: AppId): void`

- [ ] **Step 1: Write `lib/appMode.ts`**

```ts
// lib/appMode.ts
export type AppId = 'burnlog' | 'lifelog';

export interface AppMeta {
  id: AppId;
  name: string;
  tagline: string;
  home: string;
  themeClass?: string;
}

export const APPS: Record<AppId, AppMeta> = {
  burnlog: {
    id: 'burnlog',
    name: 'BurnLog',
    tagline: 'Track workouts & fitness goals',
    home: '/dashboard',
  },
  lifelog: {
    id: 'lifelog',
    name: 'LifeLog',
    tagline: 'Track expenses & budgets',
    home: '/lifelog',
    themeClass: 'app-lifelog',
  },
};

const PROTECTED_PREFIX = 'app:';
export const DEFAULT_APP_KEY = 'app:defaultApp';
export const ACTIVE_APP_KEY = 'app:activeApp';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isAppId(val: string | null): val is AppId {
  return val === 'burnlog' || val === 'lifelog';
}

function safeGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, val);
  } catch {
    // storage disabled/unavailable — no-op
  }
}

function safeRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage disabled/unavailable — no-op
  }
}

export function nsKey(app: AppId, key: string): string {
  return `${app}:${key}`;
}

export function nsGet(app: AppId, key: string): string | null {
  return safeGet(nsKey(app, key));
}

export function nsSet(app: AppId, key: string, val: string): void {
  safeSet(nsKey(app, key), val);
}

export function nsRemove(app: AppId, key: string): void {
  safeRemove(nsKey(app, key));
}

export function getDefaultApp(): AppId {
  const val = safeGet(DEFAULT_APP_KEY);
  return isAppId(val) ? val : 'burnlog';
}

export function setDefaultApp(app: AppId): void {
  safeSet(DEFAULT_APP_KEY, app);
}

export function getActiveApp(): AppId {
  const val = safeGet(ACTIVE_APP_KEY);
  return isAppId(val) ? val : 'burnlog';
}

export function setActiveApp(app: AppId): void {
  safeSet(ACTIVE_APP_KEY, app);
}

export function wipeAppStorage(app: AppId): void {
  if (!isBrowser()) return;
  const prefix = nsKey(app, '');
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix) && !k.startsWith(PROTECTED_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // storage disabled/unavailable — no-op
  }
}
```

- [ ] **Step 2: Write the self-test script `lib/appMode.selftest.ts`**

This is a plain assertion script (no test framework in this repo) runnable directly with `ts-node`. It fakes `window.localStorage` with an in-memory `Map`-backed implementation before importing the module under test.

```ts
// lib/appMode.selftest.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, val: string) {
    this.store.set(key, val);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

(global as any).window = { localStorage: new FakeStorage() };

async function main() {
  const {
    nsKey,
    nsGet,
    nsSet,
    nsRemove,
    getDefaultApp,
    setDefaultApp,
    getActiveApp,
    setActiveApp,
    wipeAppStorage,
    DEFAULT_APP_KEY,
    ACTIVE_APP_KEY,
  } = await import('./appMode');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  // nsKey / nsSet / nsGet / nsRemove
  assert(nsKey('burnlog', 'foo') === 'burnlog:foo', 'nsKey composes app:key');
  nsSet('burnlog', 'foo', 'bar');
  assert(nsGet('burnlog', 'foo') === 'bar', 'nsGet reads what nsSet wrote');
  nsRemove('burnlog', 'foo');
  assert(nsGet('burnlog', 'foo') === null, 'nsRemove deletes the key');

  // getDefaultApp fallback + set
  assert(getDefaultApp() === 'burnlog', 'getDefaultApp falls back to burnlog when unset');
  setDefaultApp('lifelog');
  assert(getDefaultApp() === 'lifelog', 'setDefaultApp persists');
  assert((window as any).localStorage.getItem(DEFAULT_APP_KEY) === 'lifelog', 'default app key is app:defaultApp');

  // getActiveApp fallback + set
  assert(getActiveApp() === 'burnlog', 'getActiveApp falls back to burnlog when unset');
  setActiveApp('lifelog');
  assert(getActiveApp() === 'lifelog', 'setActiveApp persists');
  assert((window as any).localStorage.getItem(ACTIVE_APP_KEY) === 'lifelog', 'active app key is app:activeApp');

  // wipeAppStorage safety
  nsSet('burnlog', 'streak', '5');
  nsSet('burnlog', 'draftEntry', 'x');
  nsSet('lifelog', 'budget', '100');
  setDefaultApp('lifelog');
  setActiveApp('burnlog');
  (window as any).localStorage.setItem('sb-auth-token', 'secret');
  (window as any).localStorage.setItem('burnlog-theme', 'dark');

  wipeAppStorage('burnlog');

  assert(nsGet('burnlog', 'streak') === null, 'wipeAppStorage removes burnlog:streak');
  assert(nsGet('burnlog', 'draftEntry') === null, 'wipeAppStorage removes burnlog:draftEntry');
  assert(nsGet('lifelog', 'budget') === '100', 'wipeAppStorage does not touch lifelog namespace');
  assert(getDefaultApp() === 'lifelog', 'wipeAppStorage does not touch app:defaultApp');
  assert(getActiveApp() === 'burnlog', 'wipeAppStorage does not touch app:activeApp');
  assert((window as any).localStorage.getItem('sb-auth-token') === 'secret', 'wipeAppStorage does not touch sb- auth keys');
  assert((window as any).localStorage.getItem('burnlog-theme') === 'dark', 'wipeAppStorage does not touch the theme key');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll appMode assertions passed');
}

main();
```

- [ ] **Step 3: Run the self-test and verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/appMode.selftest.ts`

Expected: every line prints `OK: ...`, ending with `All appMode assertions passed`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/appMode.ts lib/appMode.selftest.ts
git commit -m "feat: add appMode module for namespaced app storage and registry"
```

---

### Task 2: Move BurnLog routes into the `(burnlog)` route group

**Files:**
- Move: `app/dashboard/**` → `app/(burnlog)/dashboard/**`
- Move: `app/goals/**` → `app/(burnlog)/goals/**`
- Move: `app/session/**` → `app/(burnlog)/session/**`
- Move: `app/insights/**` → `app/(burnlog)/insights/**`
- Move: `app/profile/**` → `app/(burnlog)/profile/**`
- Create: `app/(burnlog)/layout.tsx`

**Interfaces:**
- Consumes: `setActiveApp` from `lib/appMode.ts` (Task 1).
- Produces: `app/(burnlog)/layout.tsx` — a client layout that marks BurnLog as the active app and strips the LifeLog theme class. Later tasks (TopBar, AppSwitcher) rely on `getActiveApp()`/`ACTIVE_APP_KEY` reflecting this.

Route groups are purely a folder-naming convention — moving files into `app/(burnlog)/dashboard/page.tsx` does not change the served URL `/dashboard`. No import paths inside the moved files need to change, since none of them reference their own path.

- [ ] **Step 1: Move the five route folders with git mv (preserves history)**

```bash
git mv app/dashboard app/\(burnlog\)/dashboard
git mv app/goals app/\(burnlog\)/goals
git mv app/session app/\(burnlog\)/session
git mv app/insights app/\(burnlog\)/insights
git mv app/profile app/\(burnlog\)/profile
```

- [ ] **Step 2: Write `app/(burnlog)/layout.tsx`**

```tsx
// app/(burnlog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function BurnlogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('app-lifelog');
    setActiveApp('burnlog');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 3: Verify the app builds and URLs are unchanged**

Run: `npm run dev` (or `npx next build`), then visit `/dashboard`, `/goals`, `/session`, `/insights`, `/profile` and confirm each loads exactly as before the move (same URL, same content).

Expected: no 404s, no changed URLs, no console errors related to missing modules.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move BurnLog routes into (burnlog) route group"
```

---

### Task 3: `(lifelog)` route group with placeholder page and its own bottom nav

**Files:**
- Create: `app/(lifelog)/layout.tsx`
- Create: `app/(lifelog)/lifelog/page.tsx`
- Create: `components/LifeLogBottomNav.tsx`

**Interfaces:**
- Consumes: `setActiveApp` from `lib/appMode.ts` (Task 1); `TopBar` from `components/TopBar.tsx` (existing, modified in Task 6 — using it here before Task 6 is fine, it already accepts `title`).
- Produces: `/lifelog` route rendering a placeholder home; `LifeLogBottomNav` component (single "Home" tab pointing at `/lifelog`), reused by any future LifeLog page.

- [ ] **Step 1: Write `app/(lifelog)/layout.tsx`**

```tsx
// app/(lifelog)/layout.tsx
'use client';

import { useEffect } from 'react';
import { setActiveApp } from '@/lib/appMode';

export default function LifelogLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('app-lifelog');
    setActiveApp('lifelog');
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: Write `components/LifeLogBottomNav.tsx`**

A minimal nav scoped to LifeLog's current single screen. Deliberately small — more tabs are added when Sub-Project 2 adds LifeLog pages.

```tsx
// components/LifeLogBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/lifelog', label: 'Home', Icon: WalletIcon },
];

export function LifeLogBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2 py-2 shadow-lg backdrop-blur-md"
      aria-label="Primary"
    >
      {tabs.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center rounded-full px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Write `app/(lifelog)/lifelog/page.tsx`**

```tsx
// app/(lifelog)/lifelog/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LifeLogHomePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar title="LifeLog" />
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle>LifeLog is coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Expense tracking, budgeting, and grocery planning will land here.
            </p>
          </CardContent>
        </Card>
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, navigate to `/lifelog`.

Expected: page renders with the "coming soon" card and the LifeLog bottom nav. (Theme won't visually differ yet — that's Task 4.)

- [ ] **Step 5: Commit**

```bash
git add app/\(lifelog\) components/LifeLogBottomNav.tsx
git commit -m "feat: add (lifelog) route group with placeholder home page"
```

---

### Task 4: LifeLog theme palette (`.app-lifelog` CSS overrides)

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing design tokens already defined in `:root` and `.dark` (e.g. `--primary`, `--background`, `--chart-1`..`--chart-5`, `--sidebar*`).
- Produces: `.app-lifelog` and `.app-lifelog.dark` class blocks that every existing component picks up automatically (they already read these token names).

- [ ] **Step 1: Append the LifeLog theme blocks to `app/globals.css`**

Add after the existing `.dark { ... }` block:

```css
.app-lifelog {
  --background: #f4faf9;
  --foreground: oklch(0.28 0.05 200);
  --card: #f4faf9;
  --card-foreground: oklch(0.28 0.05 200);
  --popover: #f4faf9;
  --popover-foreground: oklch(0.28 0.05 200);
  --primary: oklch(0.6 0.14 165);
  --primary-foreground: #f4faf9;
  --secondary: oklch(0.45 0.1 200);
  --secondary-foreground: #f4faf9;
  --muted: oklch(0.9 0.04 170);
  --muted-foreground: oklch(0.4 0.06 200);
  --accent: oklch(0.82 0.08 175);
  --accent-foreground: oklch(0.28 0.05 200);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.85 0.04 170);
  --input: oklch(0.85 0.04 170);
  --ring: oklch(0.6 0.14 165);
  --chart-1: oklch(0.6 0.14 165);
  --chart-2: oklch(0.5 0.13 175);
  --chart-3: oklch(0.45 0.1 200);
  --chart-4: oklch(0.82 0.08 175);
  --chart-5: oklch(0.4 0.06 200);
  --sidebar: #f4faf9;
  --sidebar-foreground: oklch(0.28 0.05 200);
  --sidebar-primary: oklch(0.6 0.14 165);
  --sidebar-primary-foreground: #f4faf9;
  --sidebar-accent: oklch(0.82 0.08 175);
  --sidebar-accent-foreground: oklch(0.28 0.05 200);
  --sidebar-border: oklch(0.85 0.04 170);
  --sidebar-ring: oklch(0.6 0.14 165);
}

.app-lifelog.dark {
  --background: oklch(0.22 0.03 200);
  --foreground: #f2fbf9;
  --card: oklch(0.28 0.04 195);
  --card-foreground: #f2fbf9;
  --popover: oklch(0.28 0.04 195);
  --popover-foreground: #f2fbf9;
  --primary: oklch(0.65 0.14 165);
  --primary-foreground: oklch(0.2 0.03 200);
  --secondary: oklch(0.45 0.1 200);
  --secondary-foreground: #f2fbf9;
  --muted: oklch(0.3 0.04 195);
  --muted-foreground: oklch(0.75 0.05 175);
  --accent: oklch(0.38 0.08 180);
  --accent-foreground: #f2fbf9;
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 18%);
  --ring: oklch(0.55 0.1 175);
  --chart-1: oklch(0.65 0.14 165);
  --chart-2: oklch(0.55 0.13 175);
  --chart-3: oklch(0.45 0.1 200);
  --chart-4: oklch(0.38 0.08 180);
  --chart-5: oklch(0.75 0.05 175);
  --sidebar: oklch(0.28 0.04 195);
  --sidebar-foreground: #f2fbf9;
  --sidebar-primary: oklch(0.65 0.14 165);
  --sidebar-primary-foreground: oklch(0.2 0.03 200);
  --sidebar-accent: oklch(0.38 0.08 180);
  --sidebar-accent-foreground: #f2fbf9;
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.55 0.1 175);
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open dev tools console, run `document.documentElement.classList.add('app-lifelog')` on any page.

Expected: background/primary/accent colors shift to the teal/emerald palette immediately, in both light and with `.dark` also toggled on. Remove the class and confirm it reverts to the BurnLog palette.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add .app-lifelog theme palette overrides"
```

---

### Task 5: App-switch context, provider, and full-screen loader

**Files:**
- Create: `lib/appSwitchContext.tsx`
- Create: `components/SwitchLoader.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `APPS`, `AppId`, `getActiveApp`, `setActiveApp`, `wipeAppStorage` from `lib/appMode.ts` (Task 1).
- Produces:
  - `AppSwitchProvider({ children }): JSX.Element` — wraps the app.
  - `useAppSwitch(): { switchingTo: AppId | null; switchTo: (target: AppId) => void }` — consumed by `TopBar`/`AppSwitcher` (Task 6) and `BootRedirect` is independent of this (Task 7 uses `appMode` directly, not this context).
  - `<SwitchLoader />` — renders `null` when not switching; a full-screen overlay otherwise. Must live in the **root** layout (`app/layout.tsx`), not inside either route group, because `AppSwitchProvider`'s state must survive navigation across the `(burnlog)`/`(lifelog)` boundary.

- [ ] **Step 1: Write `lib/appSwitchContext.tsx`**

```tsx
// lib/appSwitchContext.tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPS, AppId, getActiveApp, setActiveApp, wipeAppStorage } from '@/lib/appMode';

interface AppSwitchContextValue {
  switchingTo: AppId | null;
  switchTo: (target: AppId) => void;
}

const AppSwitchContext = createContext<AppSwitchContextValue>({
  switchingTo: null,
  switchTo: () => {},
});

const MIN_VISIBLE_MS = 700;

export function AppSwitchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [switchingTo, setSwitchingTo] = useState<AppId | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchTo = useCallback(
    (target: AppId) => {
      const current = getActiveApp();
      if (current === target) return;

      setSwitchingTo(target);
      wipeAppStorage(current);
      setActiveApp(target);
      router.push(APPS[target].home);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSwitchingTo(null), MIN_VISIBLE_MS);
    },
    [router]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AppSwitchContext.Provider value={{ switchingTo, switchTo }}>
      {children}
    </AppSwitchContext.Provider>
  );
}

export function useAppSwitch() {
  return useContext(AppSwitchContext);
}
```

- [ ] **Step 2: Write `components/SwitchLoader.tsx`**

```tsx
// components/SwitchLoader.tsx
'use client';

import { Loader2 } from 'lucide-react';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Switching to {app.name}…</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire `AppSwitchProvider` and `SwitchLoader` into `app/layout.tsx`**

Modify `app/layout.tsx`: add imports and wrap the existing body contents.

```tsx
// app/layout.tsx — add these imports near the existing ones
import { AppSwitchProvider } from "@/lib/appSwitchContext";
import { SwitchLoader } from "@/components/SwitchLoader";
```

```tsx
// app/layout.tsx — replace the existing <body> contents with:
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light" storageKey="burnlog-theme">
          <SessionContextProvider supabaseClient={supabaseClient}>
            <AppSwitchProvider>
              <SplashScreen />
              {children}
              <SwitchLoader />
              <Toaster />
              <PWAInstall />
              <PWAStatus />
              <PWAUpdateNotification />
            </AppSwitchProvider>
          </SessionContextProvider>
        </ThemeProvider>
      </body>
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`. Temporarily add a test button anywhere calling `useAppSwitch().switchTo('lifelog')` (e.g. in the browser console via React DevTools, or a scratch button in `app/dashboard/page.tsx` you revert after testing) and confirm: the loader appears, storage wipes, URL changes to `/lifelog`, loader disappears after ~700ms.

Expected: no console errors; loader is visible during the transition; ends on `/lifelog`.

- [ ] **Step 5: Commit**

```bash
git add lib/appSwitchContext.tsx components/SwitchLoader.tsx app/layout.tsx
git commit -m "feat: add app-switch context, provider, and full-screen switch loader"
```

---

### Task 6: `AppSwitcher` bottom sheet + `TopBar` trigger

**Files:**
- Create: `components/AppSwitcher.tsx`
- Modify: `components/TopBar.tsx`

**Interfaces:**
- Consumes: `APPS`, `AppId`, `getActiveApp`, `getDefaultApp`, `setDefaultApp` from `lib/appMode.ts` (Task 1); `useAppSwitch` from `lib/appSwitchContext.tsx` (Task 5); `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle` from `components/ui/drawer.tsx`; `Card`, `CardContent` from `components/ui/card.tsx`; `Switch` from `components/ui/switch.tsx`.
- Produces: `<AppSwitcher open, onOpenChange />`; `TopBar`'s logo becomes a button that opens it.

- [ ] **Step 1: Write `components/AppSwitcher.tsx`**

```tsx
// components/AppSwitcher.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Wallet } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { APPS, AppId, getActiveApp, getDefaultApp, setDefaultApp } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';

interface AppSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSwitcher({ open, onOpenChange }: AppSwitcherProps) {
  const { switchTo } = useAppSwitch();
  const [activeApp, setActiveAppState] = useState<AppId>('burnlog');
  const [defaultApp, setDefaultAppState] = useState<AppId>('burnlog');

  useEffect(() => {
    if (!open) return;
    setActiveAppState(getActiveApp());
    setDefaultAppState(getDefaultApp());
  }, [open]);

  function handleSelect(id: AppId) {
    if (id === activeApp) return;
    onOpenChange(false);
    switchTo(id);
  }

  function handleSetDefault(id: AppId) {
    setDefaultApp(id);
    setDefaultAppState(id);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Switch app</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-3 p-4 pb-8">
          {Object.values(APPS).map((app) => (
            <Card
              key={app.id}
              onClick={() => handleSelect(app.id)}
              className={`cursor-pointer transition-colors ${
                activeApp === app.id ? 'border-primary' : ''
              }`}
            >
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3">
                  {app.id === 'lifelog' ? (
                    <Wallet className="h-6 w-6 text-primary" />
                  ) : (
                    <Image src="/B.png" alt={app.name} width={24} height={24} />
                  )}
                  <div>
                    <p className="font-semibold">
                      {app.name}
                      {activeApp === app.id ? ' (Active)' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{app.tagline}</p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-muted-foreground">Default</span>
                  <Switch
                    checked={defaultApp === app.id}
                    onCheckedChange={() => handleSetDefault(app.id)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Modify `components/TopBar.tsx` to trigger the switcher from the logo**

Replace the full file:

```tsx
// components/TopBar.tsx
'use client';

import { useEffect, useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { AppSwitcher } from './AppSwitcher';
import Image from 'next/image';
import { AppId, getActiveApp } from '@/lib/appMode';

interface TopBarProps {
  title: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onClose, actions }: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeApp, setActiveAppState] = useState<AppId>('burnlog');

  useEffect(() => {
    setActiveAppState(getActiveApp());
  }, []);

  return (
    <div className="w-full bg-background text-foreground shadow p-4 sticky top-0 z-10 relative flex justify-between">
      <div className='flex gap-3 items-center'>
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-label="Switch app"
          className="flex items-center justify-center"
        >
          {activeApp === 'lifelog' ? (
            <Wallet className="h-5 w-5 text-primary" />
          ) : (
            <Image src="/B.png" alt="Logo" width={20} height={20} />
          )}
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {onClose && (
          <button
            className="ml-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        )}
      </div>
      <AppSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. On `/dashboard`, tap the logo. Confirm the bottom sheet opens showing both apps, BurnLog marked active. Tap LifeLog → loader → lands on `/lifelog` with the teal theme applied. Tap the logo again (now `Wallet` icon) → sheet shows LifeLog active → tap BurnLog → loader → back on `/dashboard` with the orange theme.

Expected: switching works both directions; the "Default" switch toggles independent of navigation (toggling it does not itself switch apps).

- [ ] **Step 4: Commit**

```bash
git add components/AppSwitcher.tsx components/TopBar.tsx
git commit -m "feat: add AppSwitcher bottom sheet triggered from TopBar logo"
```

---

### Task 7: Default-boot redirect

**Files:**
- Create: `components/BootRedirect.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `APPS`, `getDefaultApp`, `setActiveApp` from `lib/appMode.ts` (Task 1).
- Produces: `<BootRedirect />` — client component rendered by the server-guarded root page; no other task depends on this.

- [ ] **Step 1: Write `components/BootRedirect.tsx`**

```tsx
// components/BootRedirect.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { APPS, getDefaultApp, setActiveApp } from '@/lib/appMode';

export function BootRedirect() {
  const router = useRouter();

  useEffect(() => {
    const app = getDefaultApp();
    setActiveApp(app);
    router.replace(APPS[app].home);
  }, [router]);

  return null;
}
```

- [ ] **Step 2: Modify `app/page.tsx`**

```tsx
// app/page.tsx - runs on every request
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BootRedirect } from '@/components/BootRedirect';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  // If no session, redirect to login
  if (!session) {
    return redirect('/login');
  }

  // Check for existing Profile row
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('userId', session.user.id)
    .single();

  // If no profile, redirect to profile setup
  if (!profile) {
    return redirect('/signup/profile');
  }

  // User is authenticated and has a profile — boot into their default app
  return <BootRedirect />;
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. With no `app:defaultApp` set (clear localStorage), visit `/` while logged in → should land on `/dashboard` (BurnLog fallback default). In the AppSwitcher, set LifeLog as default, then visit `/` again → should land on `/lifelog`.

Expected: correct redirect in both cases; logged-out visit to `/` still goes to `/login`; no-profile visit still goes to `/signup/profile`.

- [ ] **Step 4: Commit**

```bash
git add components/BootRedirect.tsx app/page.tsx
git commit -m "feat: boot into the user's default app from the root route"
```

---

### Task 8: "App" settings section on the Profile page

**Files:**
- Modify: `app/(burnlog)/profile/page.tsx`

**Interfaces:**
- Consumes: `APPS`, `AppId`, `getDefaultApp`, `setDefaultApp` from `lib/appMode.ts` (Task 1); `Card`, `CardHeader`, `CardTitle`, `CardContent` (already imported in this file); `Switch` from `components/ui/switch.tsx`.

- [ ] **Step 1: Add imports to `app/(burnlog)/profile/page.tsx`**

Near the top, alongside the existing imports:

```tsx
import { Switch } from '@/components/ui/switch';
import { APPS, AppId, getDefaultApp, setDefaultApp } from '@/lib/appMode';
```

- [ ] **Step 2: Add local state for the default app**

Inside the `ProfilePage` component, alongside the existing `useState` declarations (near `const [userId, setUserId] = useState<string | null>(null);`):

```tsx
const [defaultApp, setDefaultAppState] = useState<AppId>('burnlog');

useEffect(() => {
  setDefaultAppState(getDefaultApp());
}, []);

function handleSetDefaultApp(app: AppId) {
  setDefaultApp(app);
  setDefaultAppState(app);
}
```

- [ ] **Step 3: Add an "App" `Card` section to the rendered JSX**

Insert this new `Card` block adjacent to the other settings `Card`s already in the page (e.g. right after the closing `</Card>` that follows the "Personal Information" section, using the same `Card`/`CardHeader`/`CardTitle`/`CardContent` pattern already in this file):

```tsx
<Card>
  <CardHeader>
    <CardTitle>App</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {Object.values(APPS).map((app) => (
      <div key={app.id} className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{app.name}</p>
          <p className="text-xs text-muted-foreground">Boot into {app.name} by default</p>
        </div>
        <Switch
          checked={defaultApp === app.id}
          onCheckedChange={() => handleSetDefaultApp(app.id)}
        />
      </div>
    ))}
  </CardContent>
</Card>
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, visit `/profile`. Confirm the new "App" card renders with two rows (BurnLog, LifeLog), each with a switch; toggling one turns the other off (since only one can be default); reload `/profile` and confirm the state persisted.

- [ ] **Step 5: Commit**

```bash
git add app/\(burnlog\)/profile/page.tsx
git commit -m "feat: add App default-boot setting to Profile page"
```

---

### Task 9: Middleware verification for `/lifelog`

**Files:**
- Verify only: `middleware.ts` (no code change expected)

**Interfaces:**
- None — this task is a verification pass, not a code change, per the design spec's note that the existing matcher/guard already covers `/lifelog`.

- [ ] **Step 1: Read `middleware.ts` and confirm `/lifelog` is not in `publicRoutes`**

Open `middleware.ts` and confirm the `publicRoutes` array (`['/login', '/signup', '/signup/profile']`) does not include `/lifelog`, and the matcher config does not exclude it.

- [ ] **Step 2: Verify manually — logged-out access to `/lifelog` redirects to `/login`**

Run: `npm run dev`, log out (or use an incognito window), navigate directly to `http://localhost:3000/lifelog`.

Expected: redirected to `/login`, exactly as any other protected BurnLog route behaves.

- [ ] **Step 3: Verify manually — logged-in access works and BurnLog routes still protected**

Log in, navigate to `/lifelog` — loads. Navigate to `/dashboard`, `/goals`, `/session`, `/insights`, `/profile` — all still load correctly (confirming the Task 2 move didn't break middleware matching).

- [ ] **Step 4: No commit needed** (verification-only task; skip if everything passes as expected)

---

## Final Verification Checklist

- [ ] `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' lib/appMode.selftest.ts` passes.
- [ ] `npx next build` completes with no errors.
- [ ] All original BurnLog URLs (`/dashboard`, `/goals`, `/session`, `/insights`, `/profile`) work unchanged.
- [ ] `/lifelog` loads, themed teal/emerald, with its own bottom nav.
- [ ] Tapping the TopBar logo opens the switcher on both BurnLog and LifeLog pages.
- [ ] Switching apps shows the loader, wipes only the outgoing app's `${app}:*` keys, and lands on the target app's home.
- [ ] Setting a default app (via switcher or Profile "App" section) persists and is honored by `/` on next load.
- [ ] Logged-out access to `/lifelog` redirects to `/login`.
