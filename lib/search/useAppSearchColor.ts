'use client';

// lib/search/useAppSearchColor.ts
//
// Live counterpart to appSearchColor() (lib/search/registry.ts) — resolves
// AdminLog > UI > App Theme's live per-app primary color, falling back to
// the same default. Use this in any client component; reserve the plain
// appSearchColor() for non-component call sites.

import type { AppId } from '@/lib/appMode';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';

/** `app` may be null (e.g. a notification with no associated app) — returns
 * the muted-foreground token in that case rather than resolving a color. */
export function useAppSearchColor(app: AppId | null): string {
  const { colorFor } = useAppThemeColors();
  return app ? colorFor(app) : 'var(--muted-foreground)';
}
