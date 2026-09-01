# App Stylesheet

Consolidated design-token reference for all 7 apps (BurnLog, Logbook, MoneyLog, TaskLog, HomeLog, SocialLog, ShoppingLog). Source of truth is `app/globals.css` (Tailwind v4, no `tailwind.config.*` — theming lives entirely in CSS custom properties). This doc is generated from that file plus the audit in `docs/superpowers/plans/color-audit.md`; update both together if tokens change.

## How theming works

One semantic token set is defined on `:root` (BurnLog's values — the default/fallback app) and re-defined per app via a `.app-<name>` class on `<html>`/`<body>`, each with a `.app-<name>.dark` block for dark mode. Every token below is available as a Tailwind utility (`bg-primary`, `text-muted-foreground`, `border-border`, etc.) via the `@theme inline` mapping at the top of `globals.css`.

```
<html class="app-homelog dark"> → --primary resolves to HomeLog's dark primary
<html>                          → --primary resolves to BurnLog's light primary (root default)
```

## Semantic tokens

| Token | Role |
|---|---|
| `--background` / `--foreground` | Page background / body text |
| `--card`, `--popover` | Surface colors |
| `--primary` / `--primary-foreground` | Brand accent — buttons, active states, icons |
| `--secondary` / `--secondary-foreground` | Deeper secondary accent |
| `--muted` / `--muted-foreground` | Subdued backgrounds, disabled/secondary text |
| `--accent` / `--accent-foreground` | Hover states, highlighted chips |
| `--destructive` | Delete/danger — **identical across all apps**: `oklch(0.577 0.245 27.325)` light / `oklch(0.704 0.191 22.216)` dark (≈ `#DC2626` / `#EF4444`) |
| `--success` / `--success-foreground` | Positive/success state — **new**, identical across all apps: `oklch(0.627 0.170 149.214)` light / `oklch(0.800 0.182 151.711)` dark (≈ `#16A34A` / `#4ADE80`) |
| `--warning` / `--warning-foreground` | Caution/warning state — **new**, identical across all apps: `oklch(0.666 0.157 58.318)` light / `oklch(0.837 0.164 84.429)` dark (≈ `#D97706` / `#FBBF24`) |
| `--info` / `--info-foreground` | Informational state — **new**, identical across all apps: `oklch(0.546 0.215 262.881)` light / `oklch(0.714 0.143 254.624)` dark (≈ `#2563EB` / `#60A5FA`) |
| `--border` / `--input` / `--ring` | Borders, form inputs, focus rings |
| `--chart-1` … `--chart-5` | Chart series colors, derived from the app's hue |
| `--sidebar*` | Sidebar surface + accents |

`--destructive`, `--success`, `--warning`, and `--info` are deliberately **not** app-tinted — a status color should mean the same thing everywhere. `--primary`, `--secondary`, `--accent`, and the neutrals ARE app-tinted (see below).

**Usage:** use `bg-success text-success-foreground`, `bg-warning text-warning-foreground`, `bg-info text-info-foreground` for status badges/pills/icons instead of hardcoding `#22C55E` / `#F59E0B` / `#3B82F6` or Tailwind's `emerald-500` / `amber-500` / `blue-500` classes directly. See [Cleanup: ad-hoc status colors](#cleanup-ad-hoc-status-colors-to-migrate) below for the files that should migrate.

## Per-app brand palette

Every app follows the same construction: background/card/popover/sidebar share one near-white tint of the app's hue; `--primary`/`--secondary` are two saturations of that hue; dark mode swaps to a dark version of the same hue (not neutral gray).

| App | Class | Hue | Light `--primary` | ≈ Hex | Dark `--primary` | ≈ Hex |
|---|---|---|---|---|---|---|
| **BurnLog** (default) | *(root)* | 60° orange | `oklch(0.76 0.16 60)` | `#F99532` | `oklch(0.76 0.16 60)` | `#F99532` |
| Logbook | `.app-logbook` | 265° indigo | `oklch(0.47 0.16 265)` | `#2D52B3` | `oklch(0.68 0.15 265)` | — |
| MoneyLog | `.app-moneylog` | 165° teal | `oklch(0.6 0.14 165)` | `#00996B` | `oklch(0.65 0.14 165)` | — |
| TaskLog | `.app-tasklog` | 255° blue | `oklch(0.55 0.18 255)` | `#026FD7` | `oklch(0.65 0.16 255)` | — |
| HomeLog | `.app-homelog` | 302° violet | `oklch(0.58 0.2 302)` | `#9253DA` | `oklch(0.66 0.18 302)` | — |
| SocialLog | `.app-sociallog` | 357° magenta | `oklch(0.46 0.19 357)` | `#A10059` | `oklch(0.62 0.19 357)` | — |
| ShoppingLog | `.app-shoppinglog` | 60° amber | `oklch(0.62 0.19 60)` | `#D46000` | `oklch(0.72 0.17 60)` | — |

Hex values computed from the `oklch()` values via CSS Color 4 conversion (verified with `culori`) — treat the hex column as a reference for design tools, the `oklch()` values in `globals.css` are the source of truth.

> **Known discrepancy:** BurnLog's root `--primary` (`oklch(0.76 0.16 60)`) is commented in `globals.css` as `#FF9E4F`, and that (slightly-off) hex is hand-duplicated in `SplashScreen.tsx` and `AchievementOverlay.tsx`. The true computed value is `#F99532`. Left as-is here since BurnLog's brand mark, splash gradient, and glow effects all consistently use `#FF9E4F` together — fixing it is a separate, purely-cosmetic follow-up, not a correctness bug.

Full per-app light+dark token blocks: `app/globals.css:68–557`.

## Brand marks (`components/*Mark.tsx`)

Fixed hex colors, intentionally independent of the active `.app-*` theme class — each mark can render in shared chrome (e.g. a bottom-nav icon) before or while a *different* app's theme is applied, so `text-primary` would resolve to the wrong color there.

| App | Component | Fixed color | Matches theme `--primary`? |
|---|---|---|---|
| BurnLog | `BurnLogMark.tsx` | `#FF9E4F` | Matches the (approximate) documented value — see discrepancy note above |
| HomeLog | `HomeLogMark.tsx` | `#9253DA` | ✅ reconciled to exact theme value |
| ShoppingLog | `ShoppingLogMark.tsx` | `#D46000` | ✅ reconciled to exact theme value |
| SocialLog | `SocialLogMark.tsx` | `#A10059` | ✅ reconciled to exact theme value |
| Logbook | `LogbookMark.tsx` | `#2D52B3` | ✅ reconciled to exact theme value |
| TaskLog | `TaskLogMark.tsx` | *(uses `var(--primary)`)* | ✅ always in sync |
| MoneyLog | `MoneyLogMark.tsx` | *(uses `var(--primary)`)* | ✅ always in sync |

## SplashScreen gradients (`components/SplashScreen.tsx`)

A separate, hand-picked 4-stop gradient per app (standard Tailwind palette stops chosen to visually match each app's hue) — not derived from the tokens above. Left as-is; documented here for completeness.

| App | Gradient stops |
|---|---|
| Logbook | `#A5B4FC #818CF8 #6366F1 #4338CA` |
| BurnLog | `#FF9E4F #F97316 #EF4444 #B55233` |
| MoneyLog | `#34D399 #10B981 #059669 #047857` |
| TaskLog | `#60A5FA #3B82F6 #2563EB #1D4ED8` |
| HomeLog | `#C4B5FD #9b5de5 #7C3AED #6D28D9` |
| SocialLog | `#FF6FA5 #F43F7E #DB2777 #9D174D` |
| ShoppingLog | `#FDBA74 #FB923C #F18701 #C2660A` |

## Cleanup: ad-hoc status colors to migrate

These files hardcode their own red/amber/green/blue ramp instead of the new `--destructive`/`--warning`/`--success`/`--info` tokens. Not changed by this pass — flagged for a follow-up:

- `app/(burnlog)/dashboard/_components/BMIWidget.tsx`
- `app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx`
- `app/(burnlog)/dashboard/_components/GoalProgressWidget.tsx`
- `app/(logbook)/logbook/_components/QuickAddFab.tsx`, `WeeklySummary.tsx`
- `app/(moneylog)/moneylog/page.tsx`, `insights/_components/FinanceInsightsClient.tsx`
- `components/logbook/ActivityTimeline.tsx`, `LogCardsGrid.tsx`
- `lib/tasklog/types.ts` (priority/status colors baked into shared type defs)
- ~140 Tailwind utility-shade classes (`text-red-500`, `bg-amber-500`, `text-emerald-500`, etc.) across badge/status UI — see `color-audit.md` §5 for the full tally.

Full raw inventory: `docs/superpowers/plans/color-audit.md`.
