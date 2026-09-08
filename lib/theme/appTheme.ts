// lib/theme/appTheme.ts
//
// AdminLog > UI > App Theme — global and per-app overrides for the primary
// and background color, in light and dark mode. A field left unset falls
// back to the "global" row's same field, then to whatever globals.css
// already hardcodes for that app (see AppThemeSettingsEffect).

export interface AppThemeFields {
  primaryLight?: string | null;
  backgroundLight?: string | null;
  primaryDark?: string | null;
  backgroundDark?: string | null;
  /** Border radius (e.g. "0.5rem"). Global-only — no per-app override. */
  radius?: string | null;
  /** Base spacing unit (e.g. "0.25rem"). Global-only. */
  spacing?: string | null;
  /** Hairline/border color, light & dark. Global-only. */
  borderLight?: string | null;
  borderDark?: string | null;
  /** Elevation (box-shadow) overrides for the xs/sm/md/lg tiers. Global-only. */
  shadowXs?: string | null;
  shadowSm?: string | null;
  shadowMd?: string | null;
  shadowLg?: string | null;
}

export const APP_THEME_FIELD_KEYS = [
  'primaryLight',
  'backgroundLight',
  'primaryDark',
  'backgroundDark',
] as const;
export type AppThemeFieldKey = (typeof APP_THEME_FIELD_KEYS)[number];

export const APP_THEME_FIELD_LABELS: Record<AppThemeFieldKey, string> = {
  primaryLight: 'Primary (light mode)',
  backgroundLight: 'Background (light mode)',
  primaryDark: 'Primary (dark mode)',
  backgroundDark: 'Background (dark mode)',
};

// Loose validation only — accepts hex, rgb()/rgba(), and oklch() since
// globals.css itself mixes hex and oklch for these same variables.
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|oklch\([^)]+\))$/;

export function isValidCssColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_PATTERN.test(value.trim());
}

// e.g. "0", "0.5rem", "8px"
const RADIUS_PATTERN = /^\d+(\.\d+)?(rem|px)?$/;

export function isValidRadius(value: unknown): value is string {
  return typeof value === 'string' && RADIUS_PATTERN.test(value.trim());
}

// Same shape as radius — a single CSS length (spacing is also a length unit).
export const isValidSpacing = isValidRadius;

// Loose validation for a CSS box-shadow value (possibly multiple
// comma-separated layers) — permits the characters real shadow values use
// (lengths, rgb()/rgba()/oklch() colors, percentages) while rejecting
// anything that could break out of a CSS custom property value.
const BOX_SHADOW_PATTERN = /^[a-zA-Z0-9 ,.#%()/\-]{1,300}$/;

export function isValidBoxShadow(value: unknown): value is string {
  return typeof value === 'string' && BOX_SHADOW_PATTERN.test(value.trim());
}

/** Resolved value for one field: app override wins, else global, else
 * undefined (meaning: don't touch the CSS variable, let globals.css's own
 * per-app rule apply as normal). */
export function resolveThemeField(
  appValue: string | null | undefined,
  globalValue: string | null | undefined
): string | undefined {
  if (appValue) return appValue;
  if (globalValue) return globalValue;
  return undefined;
}
