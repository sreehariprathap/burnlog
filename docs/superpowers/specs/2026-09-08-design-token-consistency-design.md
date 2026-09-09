# Design token consistency — stop admin customization from silently breaking

Date: 2026-09-08

## Problem

AdminLog > UI > App Theme lets an admin set a per-app (or global) primary
color, backed by `AppThemeSetting` in Postgres. `AppThemeSettingsEffect`
(mounted once in `RootLayoutClient`) already fetches this live via SWR and
applies it as CSS custom properties (`--primary`, `--background`, etc.) on
`<html>`, overriding the per-app defaults hardcoded in `app/globals.css`.

That mechanism only reaches consumers that read the CSS variables. Three
other places independently hardcode the *same* "per-app primary color"
concept and never see admin changes:

- `lib/search/registry.ts` — `APP_COLOR: Record<AppId, string>`, a literal map.
- 11 `components/*Mark.tsx` logo components — each hardcodes its own app's
  hex inline, documented as deliberate because they must render correctly
  before the ambient `.app-<id>` theme class is applied (e.g. a multi-app
  switcher showing every app's logo in its own color at once, regardless of
  which app's theme is currently active).
- The DB-backed `AppThemeSetting` table itself, which is the one admins
  actually edit.

An admin changing a color in App Theme today updates the ambient
`--primary`/`--background` vars but leaves search result colors and every
Mark logo showing the old, hardcoded value indefinitely.

Separately, ~14 files under `app/**`/`components/**` use raw hex literals
and ~18 use hardcoded Tailwind palette utility classes (`bg-red-500`,
`text-blue-600`, ...) instead of the semantic tokens defined in
`app/globals.css` (`bg-primary`, `text-destructive`, ...). These aren't all
tied to admin-customizable fields, but they're the same class of drift and
the same fix (a lint rule) closes the door on new instances of both.

## Goals

- Admin changes to per-app color in App Theme reach the search registry and
  every `Mark.tsx` logo without a rebuild, the same way they already reach
  `--primary`/`--background`.
- New code can't reintroduce a hardcoded color or a hardcoded Tailwind
  palette class without an explicit, reviewed exception.
- No large-scale rewrite of the ~30 pre-existing unrelated hardcoded-color
  files in this pass — baseline-suppress them so CI is green today, block
  only new occurrences.

## Non-goals

- Rewriting the ~30 pre-existing files with unrelated hardcoded colors.
- Changing the `AppThemeSetting` schema or the admin UI.
- A CI script backstop (ESLint only, per decision).

## Design

### 1. One shared, live color source

`AppThemeSettingsEffect` already calls
`useSWR('adminlog-app-theme-settings', fetchAppTheme, { revalidateOnFocus: false, dedupingInterval: 60_000 })`
against `/api/adminlog/app-theme`, which returns
`{ global: AppThemeFields, apps: Record<AppId, AppThemeFields> }` — every
app's override already comes down in one payload, not just the active app's.

Add `lib/theme/useAppThemeColors.ts`:

```ts
export function useAppThemeColors() {
  const { data } = useSWR(APP_THEME_KEY, fetchAppTheme, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return {
    colorFor(appId: AppId, isDark: boolean): string {
      const override = data?.apps[appId];
      const global = data?.global;
      return (
        resolveThemeField(isDark ? override?.primaryDark : override?.primaryLight,
                           isDark ? global?.primaryDark : global?.primaryLight)
        ?? APP_COLOR_DEFAULTS[appId]
      );
    },
  };
}
```

Because SWR dedupes by key, this costs no extra network request — it shares
the exact cache entry `AppThemeSettingsEffect` already maintains. Move the
existing `APP_COLOR` literal from `lib/search/registry.ts` into
`lib/theme/appColorDefaults.ts` as `APP_COLOR_DEFAULTS`, used only as the
fallback when SWR hasn't loaded yet or a field is unset — same role
`globals.css`'s hardcoded `.app-*` rules already play for `--primary`.

`fetchAppTheme`, `APP_THEME_KEY`, and `AppThemePayload` move from
`AppThemeSettingsEffect.tsx` into `lib/theme/appTheme.ts` so both the effect
and the new hook import the same fetcher/key (currently private to the
effect component).

### 2. Migrate the two drift points

- `lib/search/registry.ts`: `appSearchColor(appId)` keeps its current
  signature and behavior as a **default-only** fallback (rename its doc
  comment to say so explicitly). Add `useAppSearchColor(appId)` for
  component call sites, backed by `useAppThemeColors().colorFor`.
- `components/*Mark.tsx` (11 files): replace the inline hardcoded hex with
  `useAppSearchColor('<appId>')`. Behavior preserved — this still resolves
  before/independent of the ambient `.app-*` class, since it comes from the
  SWR cache, not from CSS.
- Any other component call sites of `appSearchColor()` found during
  implementation (e.g. `components/AppIcon.tsx`) switch to the hook the
  same way; enumerate exhaustively at implementation time via
  `grep -rn appSearchColor`.

Non-component call sites (if any exist outside React, e.g. a plain
object/array built at module scope) keep using the static
`appSearchColor()` default — flagged as a known, documented exception like
the pre-existing Mark.tsx one, not silently left in place.

### 3. Revalidation

`AppThemeSettingsEffect` already re-fetches on the existing 60s dedupe
window / next focus. Confirm the AdminLog App Theme save handler
(`app/(adminlog)/adminlog/app-theme/...`) calls SWR's `mutate(APP_THEME_KEY)`
after a successful save so an admin sees their own change immediately; add
it if missing. Other tabs/users pick it up within the existing 60s window —
same latency the CSS-var path already has today, not a regression.

### 4. ESLint rule for future drift

New local rule, wired into `eslint.config.mjs` via `eslint-plugin-local-rules`
(or an internal flat-config rule if that package doesn't fit this project's
ESLint 9 flat-config setup — confirm during implementation):

- `local/no-hardcoded-color`: flags string/template literals matching
  `#[0-9a-fA-F]{3,8}` and Tailwind palette-scale utility classes
  (`\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b`)
  inside `app/**` and `components/**`.
- Allowlist (rule option, by file path): `lib/theme/appColorDefaults.ts`,
  `lib/search/registry.ts`, the 11 `Mark.tsx` files' base default constant
  only (not arbitrary new hex), test files.
- Severity: error (existing `npm run lint` already runs in CI).

### 5. Baseline suppression

For every pre-existing violation not fixed by §2 (~30 files), add
`// eslint-disable-next-line local/no-hardcoded-color -- baseline, pre-existing, not yet migrated`
at the exact offending line via a one-time script, so CI is green
immediately and the rule only blocks *new* occurrences. No visual changes
to these files in this pass.

## Testing

- Manual: change a color in AdminLog > UI > App Theme, confirm search
  result colors and Mark.tsx logos update within the existing revalidation
  window without a rebuild.
- `npm run lint` passes with baseline suppressions in place.
- Temporarily reintroduce a hex literal outside the allowlist, confirm the
  new rule fails lint; remove it.

## Follow-up (not in this pass)

- Cleanup ticket to migrate the ~30 baseline-suppressed files to semantic
  tokens and remove their suppression comments.
