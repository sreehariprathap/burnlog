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
