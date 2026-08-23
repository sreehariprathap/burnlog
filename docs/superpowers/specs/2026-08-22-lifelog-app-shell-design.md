# LifeLog App Shell — Design (Sub-Project 1)

**Date:** 2026-08-22
**Status:** Approved design, pending spec review
**Parent effort:** Add a second app "LifeLog" (life expenses / budgeting / grocery) alongside "BurnLog" (fitness). This spec covers **only the platform shell**. LifeLog's actual features (expenses, budgets, weekly goals, grocery list, BurnLog data integration) are **Sub-Project 2** and out of scope here.

## Goal

Turn BurnLog into a two-app shell where the user can switch between **BurnLog** (existing fitness app) and **LifeLog** (new, initially a placeholder screen). Switching must be fast, isolate each app's code and data, apply a distinct theme per app, and remember a default boot app. LifeLog code must be lazy-loaded and never shipped until entered.

## Non-Goals

- Any real LifeLog product feature (expenses, budgeting, weekly goals, grocery list, investment mindset, BurnLog→LifeLog data pull). Those are Sub-Project 2.
- Cross-device sync of the default-app preference (localStorage-only by decision).
- A dedicated `/settings` route (the existing Profile page is the settings surface).

## Decisions (locked during brainstorming)

1. **Sequencing:** Shell first, then LifeLog features.
2. **Structure:** Next.js route groups — `(burnlog)` and `(lifelog)`.
3. **Storage flush on switch:** Namespaced wipe (safe) — only the outgoing app's namespace is cleared; auth, theme, and protected `app:*` keys are preserved.
4. **Switcher UX:** Bottom sheet (vaul) with two app cards + "Set as default".
5. **Default-boot storage:** localStorage only (protected namespace). Root redirect becomes a client boot step.
6. **Settings home:** Add an "App" section to the existing Profile page.

## Architecture

### Route groups

Route groups (`(name)`) are **URL-transparent** — they do not change the URL. Moving BurnLog routes into `app/(burnlog)/` keeps every existing URL (`/dashboard`, `/goals`, `/session`, `/insights`, `/profile`) identical, so **no internal links change**. Each group owns a `layout.tsx` that sets the app identity, theme class, and bottom nav.

```
app/
  layout.tsx                 # ROOT (unchanged): ThemeProvider, Supabase provider, SplashScreen, Toaster, PWA bits
  page.tsx                   # ROOT: server auth/profile guard, then renders <BootRedirect/> (client)
  login/ signup/ offline/    # public/util routes stay at root, untouched

  (burnlog)/
    layout.tsx               # marks app="burnlog"; ensures LifeLog theme class removed; renders BurnLog <BottomNav/>
    dashboard/  goals/  session/  insights/  profile/   # MOVED here verbatim; URLs unchanged

  (lifelog)/
    layout.tsx               # marks app="lifelog"; adds `.app-lifelog` theme class; renders LifeLog bottom nav
    lifelog/
      page.tsx               # placeholder home for LifeLog (stub cards / "Coming soon")
```

Next.js code-splits per route, so LifeLog's chunk is **lazy** — not downloaded until the user navigates into `/lifelog`. The first switch pays a one-time chunk load, covered by the switch loader.

### App-mode module — `lib/appMode.ts`

Single source of truth for shell behavior. Pure, framework-light, unit-testable.

```ts
export type AppId = 'burnlog' | 'lifelog';

export const APPS: Record<AppId, {
  id: AppId; name: string; tagline: string;
  home: string;            // '/dashboard' | '/lifelog'
  logo: string;            // '/B.png' | '/L.png'
  themeClass?: string;     // undefined for burnlog (default), 'app-lifelog' for lifelog
}>;

// Protected keys — NEVER wiped
const PROTECTED_PREFIX = 'app:';          // app:defaultApp, app:activeApp
export const DEFAULT_APP_KEY = 'app:defaultApp';
export const ACTIVE_APP_KEY  = 'app:activeApp';

// Namespaced storage helpers
export function nsGet(app: AppId, key: string): string | null;   // reads `${app}:${key}`
export function nsSet(app: AppId, key: string, val: string): void;
export function nsRemove(app: AppId, key: string): void;

// Preferences (protected namespace)
export function getDefaultApp(): AppId;       // reads app:defaultApp, falls back to 'burnlog'
export function setDefaultApp(app: AppId): void;
export function getActiveApp(): AppId;

// Wipe only the outgoing app's namespace `${app}:*`.
// Skips PROTECTED_PREFIX keys, Supabase auth keys (`sb-*`), and the theme key.
export function wipeAppStorage(app: AppId): void;
```

**Wipe safety rules:** iterate `localStorage` keys; delete a key only if it starts with `${app}:`. This structurally cannot touch `app:*` (protected), `sb-*` (Supabase auth), or `burnlog-theme` (theme), because none of those start with `burnlog:` or `lifelog:`.

> **Migration note:** the existing app currently writes some unnamespaced keys (e.g. theme key `burnlog-theme`, any ad-hoc keys). The wipe only removes `burnlog:` / `lifelog:` prefixed keys, so legacy keys are safe by construction. New shell code should write app-scoped state via `nsSet`. Auditing/renaming existing BurnLog localStorage usage into the namespace is **optional** and not required for the shell to work — flag it as a follow-up if any BurnLog state should be flushed on switch.

### Switching — `switchTo(app, router)`

Lives in a small client hook/util `useAppSwitch()`:

1. Show `SwitchLoader` overlay (target app's theme + logo).
2. `wipeAppStorage(outgoingApp)`.
3. `localStorage[ACTIVE_APP_KEY] = targetApp`.
4. `router.push(APPS[targetApp].home)`.
5. Overlay dismisses after the destination route commits (route change effect in the destination layout, or a minimum-visible timer, whichever is later — avoids a flash).

Cross-group navigation drops the outgoing app's React component tree (and its in-memory state) naturally.

## Theme

BurnLog theme = current palette (warm orange). LifeLog theme = a **distinct but sibling** palette (recommend a cool "money/growth" tone — teal/emerald primary, cool neutral background) so it reads as a different app while reusing every component.

Mechanism — orthogonal to light/dark:

- Light/dark stays as-is: `.dark` / (implicit light) on `<html>` via `ThemeProvider`.
- Add an **app dimension**: `.app-lifelog` on `<html>`. BurnLog is the default (no class).
- `(lifelog)/layout.tsx` adds `.app-lifelog` on mount and removes it on unmount; `(burnlog)/layout.tsx` ensures it's removed. (Toggle on `document.documentElement` in a `useEffect`.)
- `globals.css` gains two blocks that redefine the existing CSS custom properties:
  - `.app-lifelog { --primary: …; --background: …; --secondary: …; --accent: …; --ring: …; --chart-*: …; … }`
  - `.app-lifelog.dark { … dark-mode LifeLog values … }`

Because every component reads the shared tokens (`--primary`, `--background`, etc.), **no component markup changes** — only CSS var values differ per app. This keeps "shared components, different theme" true.

## App switcher UI — `components/AppSwitcher.tsx`

- **Trigger:** the TopBar logo. Replace the hardcoded `/B.png` in `TopBar.tsx` with the **active app's** logo (`APPS[getActiveApp()].logo`), rendered as a button that opens the switcher.
- **Sheet (vaul `Drawer`):** title "Switch app"; two cards:
  - Each card: app logo + name + one-line tagline; the active app shows a check / "Active" state.
  - Tapping the non-active card triggers `switchTo`.
  - A "Set as default" control (e.g. a switch or "Make default" button per app) writes `setDefaultApp(app)`.
- Themed to the current app. Uses existing UI primitives (Drawer/vaul, Card, Switch) already in the project.
- `L.png` logo asset needed in `public/` (LifeLog icon). If not provided, use a Lucide icon (e.g. `Wallet`) as a placeholder in the shell.

## Default boot — `components/BootRedirect.tsx`

Because default is localStorage-only, the server can't know it. Flow:

- `app/page.tsx` (server) keeps the existing guards: no session → `/login`; no profile → `/signup/profile`.
- Instead of redirecting to `/dashboard`, it renders `<BootRedirect/>` (client).
- `BootRedirect` reads `getDefaultApp()` and `router.replace(APPS[default].home)`. SplashScreen already covers this brief moment, so no bespoke loader needed here.

## Settings (Profile page) — "App" section

Add an "App" section to the existing Profile page:
- Shows current default app.
- Lets the user set default to BurnLog or LifeLog (`setDefaultApp`).
- Optional: a "Switch to LifeLog/BurnLog" shortcut that calls `switchTo`.

No new route; reuse existing Profile card/section patterns.

## Middleware

Add `/lifelog` to the authenticated, profile-checked route space. Concretely: the existing matcher already covers all non-asset routes, and the auth/profile guard applies to any non-public route — so `/lifelog` is already protected with **no change required**. Verify during implementation that `/lifelog` is not accidentally treated as public. No new public routes are added.

## Components & files summary

**New:**
- `lib/appMode.ts` — app registry, namespaced storage, wipe, default/active app.
- `lib/useAppSwitch.ts` (or colocated hook) — `switchTo` + loader control.
- `components/AppSwitcher.tsx` — bottom sheet.
- `components/SwitchLoader.tsx` — full-screen themed switch overlay.
- `components/BootRedirect.tsx` — client default-app redirect.
- `app/(burnlog)/layout.tsx`, `app/(lifelog)/layout.tsx`.
- `app/(lifelog)/lifelog/page.tsx` — placeholder.
- `public/L.png` — LifeLog logo (or Lucide fallback).

**Moved (no code change beyond imports if any):**
- `app/dashboard`, `app/goals`, `app/session`, `app/insights`, `app/profile` → under `app/(burnlog)/`.

**Modified:**
- `app/page.tsx` — render `<BootRedirect/>` after guards instead of hard redirect to `/dashboard`.
- `components/TopBar.tsx` — active-app logo as switcher trigger.
- `app/globals.css` — `.app-lifelog` + `.app-lifelog.dark` palette blocks.
- `app/profile/page.tsx` — "App" settings section (moves with the group).
- Possibly `components/BottomNav.tsx` — parameterize tabs per app, or add a separate LifeLog nav.

## Data flow

```
Cold load → app/page.tsx (server: auth+profile guard) → BootRedirect (client: read app:defaultApp) → /dashboard or /lifelog
Group layout mount → set active app + theme class + correct BottomNav
Tap TopBar logo → AppSwitcher sheet → pick other app / set default
switchTo(target) → SwitchLoader → wipe outgoing ns → set active → navigate → loader off on route commit
```

## Error handling

- `localStorage` unavailable (private mode / disabled): all `appMode` helpers guard `typeof window`/try-catch and fall back to defaults (`burnlog` active + default). App still works, just no persistence.
- Unknown/legacy `app:defaultApp` value → fall back to `'burnlog'`.
- Wipe never throws on a missing key; it only removes matching prefixes.

## Testing

- **Unit (`lib/appMode.ts`):** `nsGet/nsSet/nsRemove` key composition; `wipeAppStorage` removes only `${app}:*` and preserves `app:*`, `sb-*`, `burnlog-theme`; `getDefaultApp` fallback; behavior when `localStorage` throws.
- **Manual/e2e:** switch BurnLog↔LifeLog shows loader and lands on correct home; theme changes; default persists across reload; deep-linking `/lifelog` while unauthenticated redirects to login; existing BurnLog URLs unchanged after the route-group move.
- **Perf sanity:** confirm LifeLog chunk is not in the initial BurnLog bundle (route-group code-splitting).

## Rollout / ordering within the shell

1. `lib/appMode.ts` (+ unit tests).
2. Route-group move of BurnLog (verify URLs unchanged, app builds).
3. `(lifelog)` group + placeholder page + theme blocks.
4. `BootRedirect` + root page change.
5. `AppSwitcher` + `SwitchLoader` + TopBar trigger + `switchTo`.
6. Profile "App" settings section.
7. Verify middleware, perf, tests.
