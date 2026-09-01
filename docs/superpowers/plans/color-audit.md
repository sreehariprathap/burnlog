# Color Audit — All Apps

Snapshot of every color currently in use across the monorepo (logbook, burnlog, moneylog, tasklog, homelog, sociallog, shoppinglog + shared components/lib), gathered from `app/globals.css`, the `*Mark.tsx` brand components, `SplashScreen.tsx`, and a repo-wide grep for hex/rgb literals and Tailwind shade classes. This is the input for building a consolidated stylesheet — no code was changed.

There is **no `tailwind.config.*`** — this is Tailwind v4, so all theming lives in `app/globals.css` via `@theme inline` + CSS custom properties.

---

## 1. Token architecture (`app/globals.css`)

One semantic token set (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar*`) is mapped into Tailwind via `@theme inline` (`--color-primary: var(--primary)`, etc.), then **re-defined per app** using a `.app-<name>` class on `<html>`/`<body>`, each with its own light values and a `.app-<name>.dark` block for dark mode.

`:root` (no `.app-*` class) = **burnlog's** palette — burnlog is the default/fallback app and has no `themeClass` in `lib/appMode.ts`.

### Semantic roles (same across every app)
| Token | Purpose |
|---|---|
| `--background` / `--foreground` | Page background / body text |
| `--card`, `--popover` | Surface colors (usually same as background) |
| `--primary` / `--primary-foreground` | Brand accent — buttons, active states, icons |
| `--secondary` / `--secondary-foreground` | Secondary accent, darker/deeper than primary |
| `--muted` / `--muted-foreground` | Subdued backgrounds, disabled/secondary text |
| `--accent` / `--accent-foreground` | Hover states, highlighted chips |
| `--destructive` | Delete/danger actions — **identical across all 7 apps** |
| `--border` / `--input` / `--ring` | Borders, form inputs, focus rings |
| `--chart-1..5` | Chart/graph series colors, derived from the app's hue |
| `--sidebar*` | Sidebar surface + accents, mirrors card/primary/accent |

`--destructive` is the one token every app shares verbatim: light `oklch(0.577 0.245 27.325)`, dark `oklch(0.704 0.191 22.216)` (a red, ~`#DC2626`/`#EF4444`).

### Per-app primary color table

| App | Class | Light `--primary` | ≈ Hex | Light `--background` |
|---|---|---|---|---|
| **burnlog** (default) | *(root, no class)* | `oklch(0.76 0.16 60)` | `#FF9E4F` | `#f8f9fa` |
| logbook | `.app-logbook` | `oklch(0.47 0.16 265)` | indigo/blue | `#f6f7fb` |
| moneylog | `.app-moneylog` | `oklch(0.6 0.14 165)` | teal/green | `#f4faf9` |
| tasklog | `.app-tasklog` | `oklch(0.55 0.18 255)` | blue | `#f5f7fb` |
| homelog | `.app-homelog` | `oklch(0.58 0.2 302)` | purple/violet | `#f8f5fc` |
| sociallog | `.app-sociallog` | `oklch(0.46 0.19 357)` | pink/rose | `#fdf5f8` |
| shoppinglog | `.app-shoppinglog` | `oklch(0.62 0.19 60)` | orange | `#fff7ed` |

Every app follows the same hue-rotation pattern: background/card/popover/sidebar share one very-light near-white tint of the hue; `--primary` and `--secondary` are two saturations of that hue; `--muted`/`--border`/`--input` are light desaturated versions; dark mode swaps to a dark version of the same hue rather than a neutral gray. This is a deliberate, consistent system — worth preserving as-is in the stylesheet rather than "fixing."

Full per-app light+dark values are in `app/globals.css:68-545` (7 apps × light/dark = 14 blocks, ~23 tokens each).

---

## 2. Per-app brand marks (fixed colors, independent of theme)

These `components/*Mark.tsx` components render each app's short-form logo/wordmark in a **fixed** color that does NOT follow the active `.app-*` theme (each has a comment noting this is intentional, so the mark reads correctly even when another app's theme is active on shared chrome):

| App | Component | Fixed color |
|---|---|---|
| BurnLog | `BurnLogMark.tsx` | `#FF9E4F` (= root `--primary`) |
| HomeLog | `HomeLogMark.tsx` | `#9b5de5` |
| ShoppingLog | `ShoppingLogMark.tsx` | `#f18701` |
| SocialLog | `SocialLogMark.tsx` | `#9e0059` |
| Logbook | `LogbookMark.tsx` | `#4C5FD5` |
| TaskLog | `TaskLogMark.tsx` | uses theme var, no fixed hex |
| MoneyLog | `MoneyLogMark.tsx` | uses theme var, no fixed hex |

Note: HomeLog's mark (`#9b5de5`) and its theme `--primary` (`oklch(0.58 0.2 302)` ≈ a redder purple) **don't match exactly** — worth reconciling when building the stylesheet. Same pattern for ShoppingLog (`#f18701` mark vs. `oklch(0.62 0.19 60)` theme primary — close but not identical) and SocialLog (`#9e0059` mark vs `oklch(0.46 0.19 357)` theme primary).

---

## 3. SplashScreen per-app palettes (`components/SplashScreen.tsx`)

A **third, separate** color set — 4-color gradients + dark/light text colors per app, used only for the launch splash animation, not derived from the CSS tokens:

| App | Light gradient colors | Light bg fill | Dark text |
|---|---|---|---|
| logbook | `#A5B4FC #818CF8 #6366F1 #4338CA` | `#EEF0FC` | `#A5B4FC` |
| burnlog | `#FF9E4F #F97316 #EF4444 #B55233` | `#FFF7ED` | `#FF9E4F` |
| moneylog | `#34D399 #10B981 #059669 #047857` | `#ECFDF5` | `#34D399` |
| tasklog | `#60A5FA #3B82F6 #2563EB #1D4ED8` | `#EFF6FF` | `#60A5FA` |
| homelog | `#C4B5FD #9b5de5 #7C3AED #6D28D9` | `#F5F3FF` | `#C4B5FD` |
| sociallog | `#FF6FA5 #F43F7E #DB2777 #9D174D` | `#FDF2F8` | `#F472B6` |
| shoppinglog | `#FDBA74 #FB923C #F18701 #C2660A` | `#FFF7ED` | `#FDBA74` |

These are standard Tailwind palette stops (indigo-300/400/500/700, orange-400/500/red-500/etc.) picked to visually match each app's theme hue — a reasonable "gradient version" of the primary tokens, but currently hand-duplicated rather than derived from `--chart-1..5`.

---

## 4. Ad-hoc / hardcoded colors in components (cleanup candidates)

These are hex or Tailwind-shade colors baked directly into component JSX rather than referencing the semantic tokens above. Mostly **semantic status colors** (red=over budget/danger, green=good/success, amber=warning, blue=info) repeated independently in each widget instead of shared `--success`/`--warning`/`--info` tokens (which don't exist yet — only `--destructive` does).

**Widgets with hardcoded status-color sets** (red/amber/green/blue, usually as a `getColor(value)` ramp):
- `app/(burnlog)/dashboard/_components/BMIWidget.tsx` — `#EF4444 #F59E0B #10B981` (danger/warning/good)
- `app/(burnlog)/dashboard/_components/DailyRingsWidget.tsx` — `#F97316 #3B82F6 #22C55E` (ring colors)
- `app/(burnlog)/dashboard/_components/GoalProgressWidget.tsx` — `#FF9E4F` / `#FF3D71`
- `app/(logbook)/logbook/_components/QuickAddFab.tsx`, `WeeklySummary.tsx` — `#F97316 #3B82F6 #22C55E #8B5CF6` (per-log-type color coding)
- `app/(moneylog)/moneylog/page.tsx`, `insights/_components/FinanceInsightsClient.tsx` — `#EF4444 #22C55E #3B82F6 #F59E0B`
- `components/logbook/ActivityTimeline.tsx`, `LogCardsGrid.tsx` — `#22C55E #9b5de5 #8B5CF6` (per-log-type coding, duplicates the *Mark.tsx colors)
- `lib/tasklog/types.ts` — `#F59E0B #60A5FA` (priority/status colors baked into shared type defs, not a component)

**One-off decorative colors:**
- `components/ui/neon-gradient-card.tsx` — `#ff00aa`, `#f0f` style neon defaults (generic UI primitive, likely fine as-is)
- `components/ui/sparkles-text.tsx` — `#FE8BBB` (sparkle default color prop)
- `components/AchievementOverlay.tsx`, `components/kokonutui/ai-loading.tsx` — `#FF9E4F`, `#FF3D71` (burnlog-specific, hardcoded rather than reading `--primary`)
- Various `rgba(255,158,79,...)` glow/shadow effects in `GoalProgressWidget.tsx`, `AchievementOverlay.tsx` — hardcoded burnlog orange as RGB triplet instead of referencing the token

**Recommendation:** the repeated red/amber/green/blue status ramp (`#EF4444`/`#F59E0B`/`#10B981` or `#22C55E`/`#3B82F6`) appears independently in 6+ files. Promoting these to shared `--success` / `--warning` / `--info` tokens (alongside the existing `--destructive`) in `globals.css` would remove most of this duplication.

---

## 5. Tailwind utility-class colors (no custom hex, just palette+shade classes)

~140 distinct `bg-*/text-*/border-*/ring-*` calls using Tailwind's built-in palette (not project tokens), concentrated in status/badge UI. Top usage:

| Class | Count | Class | Count |
|---|---|---|---|
| `text-red-500` | 36 | `text-orange-500` | 6 |
| `text-amber-500` | 21 | `text-blue-500` | 6 |
| `text-emerald-500` | 11 | `text-zinc-800` | 5 |
| `bg-amber-500` | 10 | `text-zinc-200` | 5 |
| `text-red-600` | 9 | `text-green-600` | 5 |
| `text-red-400` | 8 | `bg-blue-500` | 5 |
| `text-green-500` | 7 | `text-amber-600` | 5 |
| `bg-red-950` / `bg-red-50` | 7 each | `text-amber-400` | 5 |

Full tally has ~100 more classes at count 1-4 (mostly `gray/zinc/slate` neutrals and one-off palette colors for badges/pills). These are almost all red=danger, amber=warning, emerald/green=success, blue=info — same semantic pattern as section 4, just expressed as Tailwind classes instead of hex literals.

---

## Summary

- **1 shared token architecture** (~23 semantic tokens × light/dark), re-themed per app via `.app-<name>` classes — this is the system to formalize into a stylesheet.
- **7 per-app theme palettes** (logbook, burnlog, moneylog, tasklog, homelog, sociallog, shoppinglog), each internally consistent (one hue, varying lightness/chroma).
- **7 fixed brand-mark colors** (`*Mark.tsx`) that partially drift from their app's theme `--primary` — reconcile these.
- **1 separate splash-screen palette set** (4 gradient stops × 7 apps) duplicating the theme hues by hand.
- **~25+ ad-hoc hex colors** and **~140 Tailwind utility-shade classes** scattered through components, mostly a repeated red/amber/green/blue status pattern that has no corresponding semantic token yet (only `--destructive` exists; no `--success`/`--warning`/`--info`).
