# Card glow/gradient admin control — unify and make configurable

Date: 2026-09-09

## Problem

Dashboard cards across sub-apps use decorative gradients/glows that are
inconsistent and, per user feedback, "ugly in places." Investigation found
three independent systems instead of one:

- `components/ui/neon-gradient-card.tsx` / `stat-card.tsx` — tokenized
  (`var(--primary)`, `var(--chart-2)`), used ~15+ places, but blur/border
  size are fixed magic numbers in the component.
- `components/kokonutui/glowing-effect.tsx` — a separate tokenized
  mouse-following border-chase glow, own hardcoded opacity/blur constants.
- Ad-hoc hardcoded gradients with no shared tokens at all:
  - `components/moneylog/AssetWalletCard.tsx` — local `CATEGORY_GRADIENTS`
    map of literal Tailwind gradient classes.
  - `app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx` —
    copies the same visual language with its own hardcoded gradient.
  - `components/travellog/WeeklyTripStack.tsx` — raw hex
    `linear-gradient(...)` strings per trip.
  - `components/kokonutui/apple-activity-card.tsx` — inline SVG
    `linearGradient` + hardcoded `drop-shadow` alpha.
  - `components/ui/currency-transfer-card.tsx` — one-off
    `bg-primary/20 blur-xl` glow blob.

No admin control exists for any of this today. AdminLog already has an
established pattern for exactly this kind of thing: a Prisma model scoped
by `"global"` or `AppId`, an API route, an admin page, and a client "Effect"
component (e.g. `AppThemeSettingsEffect`) that resolves
app→global→hardcoded-default and applies the result as CSS custom
properties on `<html>`, re-running on app switch via a `MutationObserver`.

## Goals

- One admin-controlled setting (Off / Subtle / Vibrant preset, per-app with
  global fallback) that actually reaches every glow/gradient card in the
  app — not just the already-tokenized ones.
- Cards that currently use different hues to distinguish categories/items
  (wallet categories, trip cards) keep that distinguishing behavior, but
  draw hue from one shared palette instead of inventing their own hex
  values, so the preset's intensity settings apply uniformly.
- Follow the existing AdminLog pattern exactly (scope-by-id table, Effect
  component, SWR, fallback chain) rather than inventing a new mechanism.

## Non-goals

- Raw numeric sliders for opacity/blur/border — presets only, per user
  decision.
- Migrating `app/(logbook)/logbook/morning/page.tsx`'s inline background
  gradient wash — it's a page background, not a card, out of scope for this
  pass.
- Changing the existing `AppThemeSetting`/`ButtonThemeSetting` models or UI.

## Design

### 1. Data model

```prisma
model CardGlowSetting {
  id        String   @id // "global" | AppId (e.g. "burnlog", "moneylog")
  preset    String   @default("subtle") // "off" | "subtle" | "vibrant"
  updatedAt DateTime @updatedAt

  @@map("adminlog_card_glow_settings")
}
```

Same scoping convention as `AppThemeSetting`: a row per `AppId` overrides
the `"global"` row; missing row/field falls back to `"subtle"` as the
hardcoded default.

### 2. Preset → concrete values (in code, not DB)

```ts
// lib/theme/cardGlowPresets.ts
export const CARD_GLOW_PRESETS = {
  off:     { opacity: 0,    blur: '0px',  border: '0px' },
  subtle:  { opacity: 0.12, blur: '24px', border: '1px' },
  vibrant: { opacity: 0.28, blur: '40px', border: '1.5px' },
} as const;
export type CardGlowPreset = keyof typeof CARD_GLOW_PRESETS;
```

Presets are the only thing an admin picks; the numeric translation lives in
code so it can't be misconfigured into something ugly, matching the
"style presets, not fine-grained tokens" decision.

### 3. Live application: `CardGlowSettingsEffect`

New component, mounted in `RootLayoutClient` alongside
`AppThemeSettingsEffect`, following its exact shape:

- SWR-fetches `/api/adminlog/card-glow` → `{ global: { preset }, apps: Record<AppId, { preset }> }`.
- Resolves active app → global → `"subtle"`.
- Sets three CSS custom properties on `document.documentElement`:
  `--card-glow-opacity`, `--card-glow-blur`, `--card-glow-border`.
- Re-runs on the same `MutationObserver` watching `class`/`data-app`
  changes, so switching sub-apps re-resolves live.
- On fetch failure, falls back to the `subtle` preset's values (fail-open,
  same as `AppThemeSettingsEffect`) — cards never render unstyled.

### 4. Hue normalization: `glowColor()`

```ts
// lib/theme/glowPalette.ts
export function glowColor(index: number): string {
  const vars = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];
  return `var(${vars[index % vars.length]})`;
}
```

Any card that currently invents its own per-category/per-item hex color
calls this with the item's stable index instead. Categories/items keep
distinct hues (still visually distinguishable) but all draw from the one
shared chart palette, so the preset's intensity/opacity/blur applies
uniformly across them instead of each card baking in its own numbers.

### 5. Migration

| File | Change |
|---|---|
| `components/ui/neon-gradient-card.tsx` / `stat-card.tsx` | Replace fixed blur/border literals with `var(--card-glow-blur)` / `var(--card-glow-border)`; opacity via `var(--card-glow-opacity)`. Keep existing `var(--primary)`/`var(--chart-2)` color inputs as-is. |
| `components/kokonutui/glowing-effect.tsx` | Same — swap hardcoded opacity/blur constants for the CSS vars. |
| `components/moneylog/AssetWalletCard.tsx` | Replace `CATEGORY_GRADIENTS` hex map with `glowColor(categoryIndex)` + `--card-glow-*` vars. |
| `app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx` | Same treatment. |
| `components/travellog/WeeklyTripStack.tsx` | Replace raw hex gradient array with `glowColor(tripIndex)`. |
| `components/kokonutui/apple-activity-card.tsx` | SVG `linearGradient` stop-colors and `drop-shadow` alpha read the CSS vars via `getComputedStyle(document.documentElement)` client-side (inline SVG `stop-color` can't reliably consume `var()` across browsers), applied as resolved values on mount and on the same app-switch observer. |
| `components/ui/currency-transfer-card.tsx` | Swap hardcoded `bg-primary/20 blur-xl` for `--card-glow-opacity`/`--card-glow-blur`. |

### 6. Admin UI

New nav item under the existing `ui-themes` category in
`lib/adminlog/nav.ts`: **Card Glow**, linking to
`app/(adminlog)/adminlog/card-glow/page.tsx`.

Page shape matches the existing `app-theme` admin page: a global tab plus
one tab per `AppId`, each just a 3-way preset picker (Off / Subtle /
Vibrant) with a live-updating preview card. Backed by
`app/api/adminlog/card-glow/route.ts`:

- `GET` — returns `{ global, apps }` resolved payload.
- `PUT` — upserts a `CardGlowSetting` row for the given scope (`"global"`
  or an `AppId`), calls the same `mutate()` pattern the app-theme page uses
  so the admin sees their own change immediately without waiting for the
  SWR revalidation window.

## Testing

- Manual: dev server, switch each app tab in the new admin page across all
  three presets, screenshot the migrated cards in both light and dark mode
  to confirm the intensity/blur/hue changes take effect and nothing renders
  unstyled.
- Manual: confirm `AssetWalletCard`/`WeeklyTripStack` items remain visually
  distinguishable from each other after hue normalization.
- No new automated tests — this is a visual/styling change; verification is
  screenshot-based per the above.

## Follow-up (not in this pass)

- `app/(logbook)/logbook/morning/page.tsx`'s inline gradient wash, if it
  turns out to bother the same "ugly in places" complaint later.
