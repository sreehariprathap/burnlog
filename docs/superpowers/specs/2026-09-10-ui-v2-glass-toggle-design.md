# UI v2 (Glass) Toggle — Design Spec

Date: 2026-09-10
Status: Approved for implementation

## Context

The DesignCode UI Figma kit was pulled into `app/globals.css` as additive
design tokens (typography scale, foreground opacity scale, glass surface
primitives — `bg-glass`, `border-glass`, `shadow-glass`, `blur-glass`).
Nothing in the app actually renders with the glass look yet — Button, Card,
Input, and the bottom nav still hardcode solid/flat Tailwind utilities.

AdminLog already has a mature pattern for global, admin-controlled runtime
overrides: a Supabase settings table (`AppThemeSetting`, `TypographySetting`,
`ButtonThemeSetting`, `CardGlowSetting`), a `GET` (public) / `PUT`
(admin-only) API route per setting, a `lib/theme/<x>.ts` fetch helper +
SWR key, and an `<X>SettingsEffect.tsx` client component mounted once in
`RootLayoutClient` that resolves the effective value and writes it as a CSS
custom property / DOM attribute, refreshed on app-switch via
`MutationObserver`.

This spec extends that pattern with a single global boolean — "UI v2" — that
switches the core chrome primitives (Button, Card, Input, bottom nav) between
today's flat look (v1, default) and the glass look (v2), while every per-app
accent color (`--primary`, `--secondary`, etc.) stays exactly as-is in both
versions.

## Goals

- One admin toggle (AdminLog > UI > "v2 (Beta)"), default OFF, global only
  (no per-app override — this is an all-or-nothing visual rollout, not a
  themeable value).
- Flipping it changes Button, Card, Input, and the bottom nav app-wide,
  instantly, with no code deploy.
- Flipping it back OFF restores today's exact appearance — v1 values are
  literally today's current CSS, not an approximation.
- Per-app color identity (MoneyLog teal, WatchLog red, etc.) is preserved in
  both versions — v2 changes surface/chrome (blur, translucency, border,
  shadow, radius), never the accent hue.

## Non-goals

- Restyling every component in the app (dialogs, sheets, popovers, form
  controls beyond Input, etc.). Only Button, Card, Input, and bottom nav are
  in scope for this pass. Extending v2 to more components is a follow-up.
- Per-app override of the v2 flag. It's a single global switch.
- Pixel-exact reproduction of the Figma kit. Values are adapted to fit the
  app's existing per-app color system (see the glass tokens already in
  `globals.css`, derived via `color-mix` from `--foreground`/`--card` rather
  than the kit's literal black/white).

## Data model

New Supabase table `adminlog_ui_version_settings`, mirrored by a Prisma
model, following the exact shape of the existing single-purpose settings
tables:

```prisma
model UiVersionSetting {
  id      String  @id // always "global" — no per-app scoping
  enabled Boolean @default(false)
}
```

## API

`app/api/adminlog/ui-version/route.ts`:
- `GET` — public (every page needs to resolve this before first paint,
  same as `app-theme`). Returns `{ enabled: boolean }`.
- `PUT` — admin-only (`requireAdminCaller`, same guard as `app-theme`).
  Body: `{ enabled: boolean }`.

## Client wiring

`lib/theme/uiVersion.ts` — `UI_VERSION_KEY` SWR key, `fetchUiVersion()`,
mirroring `lib/theme/appTheme.ts`.

`components/adminlog/UiVersionSettingsEffect.tsx` — mounted once in
`RootLayoutClient` alongside `AppThemeSettingsEffect` /
`TypographySettingsEffect`. Resolves `enabled` via SWR and sets
`document.documentElement.setAttribute('data-ui-version', enabled ? 'v2' : 'v1')`.
No per-app resolution needed (global-only), so no `MutationObserver` on
`data-app` is required — only the SWR data dependency.

AdminLog settings UI: a new toggle under **AdminLog > UI > "v2 (Beta)"**,
same list/section it already surfaces App Theme / Typography / Button Theme
/ Card Glow, calling the new API route.

## CSS: surface tokens

`app/globals.css` gains a new block of *surface* custom properties — the
actual properties Button/Card/Input/bottom-nav will render with — defined
in `:root` with v1 values (today's current literals, copied as-is so v1 is
pixel-identical to current production), then fully redefined under
`:root[data-ui-version="v2"]` using the glass primitives already added
(`--color-glass`, `--color-glass-border`, `--shadow-glass`, `--blur-glass`):

```
--surface-card-bg, --surface-card-border, --surface-card-shadow,
--surface-card-blur, --surface-card-radius

--surface-button-chrome-bg, --surface-button-chrome-border,
--surface-button-chrome-shadow, --surface-button-chrome-blur
  (applies to the outline/secondary/ghost button variants — bordered
  "chrome" buttons. The solid `default` primary CTA variant keeps its
  brand-color fill in both versions; v2 only adds --shadow-glass elevation
  to it, matching the Figma kit's Button Primary "Glass" style which stays
  a solid brand fill, not translucent)

--surface-input-bg, --surface-input-border, --surface-input-radius

--surface-nav-bg, --surface-nav-border, --surface-nav-blur, --surface-nav-shadow
```

v1 values are today's literals (e.g. `--surface-nav-bg: var(--background)`
at the opacity currently hardcoded as `bg-background/40`, `--surface-nav-blur:
12px` matching current `backdrop-blur-md`, etc.) so v1 is provably a no-op.

## Component refactors

1. **Consolidate the bottom nav first** (13 byte-identical files:
   `HomeLogBottomNav.tsx`, `MoneyLogBottomNav.tsx`, `WatchLogBottomNav.tsx`,
   `TravelLogBottomNav.tsx`, `SocialLogBottomNav.tsx`, `TaskLogBottomNav.tsx`,
   `LearnLogBottomNav.tsx`, `ShoppingLogBottomNav.tsx`, `BottomNav.tsx`,
   `IntelLogBottomNav.tsx`, `AdminLogBottomNav.tsx`, plus the base pattern).
   Extract the shared wrapper className into one exported constant
   (`lib/ui/navShell.ts` → `NAV_SHELL_CLASS`) built from the new
   `--surface-nav-*` variables via arbitrary-value utilities
   (`bg-[var(--surface-nav-bg)] border-[var(--surface-nav-border)]
   backdrop-blur-[var(--surface-nav-blur)] shadow-[var(--surface-nav-shadow)]`).
   Each of the 13 files imports the constant instead of repeating the
   literal string. Zero visual change by itself — this is what lets the v2
   toggle affect all 13 from one CSS block instead of 13 edits.

2. **`components/ui/card.tsx`** — `bg-card` + `shadow-sm` on the root div
   become the `--surface-card-*` variables.

3. **`components/ui/button.tsx`** — `outline`, `secondary`, and `ghost`
   variants in `buttonVariants` route their background/border/shadow through
   `--surface-button-chrome-*`. `default` and `destructive` (solid brand-color
   variants) are untouched except gaining `shadow-[var(--shadow-glass)]` in v2.

4. **`components/ui/input.tsx`** — background/border become
   `--surface-input-*`.

## Testing / verification

- `npm run build` after each component refactor (type/lint safety net,
  already the working pattern this session).
- Manual verification: toggle the new admin setting, reload, and visually
  confirm (dev server + browser) that Button/Card/Input/bottom-nav switch
  between flat and glass, on at least two per-app themes (e.g. HomeLog and
  MoneyLog) in both light and dark mode, and that toggling back OFF is
  visually identical to the pre-change app.
- No automated visual regression tooling exists in this repo currently —
  out of scope to add one for this change.

## Rollout

Default `enabled = false` — ships dark/invisible until an admin opts in via
the new toggle. No migration risk to existing users.
