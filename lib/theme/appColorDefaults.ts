// lib/theme/appColorDefaults.ts
//
// Fallback per-app brand color, used only when AdminLog > UI > App Theme
// hasn't set a primary color for an app (or the live value hasn't loaded
// yet). This used to be the *only* source for this concept (as `APP_COLOR`
// in lib/search/registry.ts) — see useAppThemeColors for the live lookup
// that now takes priority over this.

import type { AppId } from '@/lib/appMode';

export const APP_COLOR_DEFAULTS: Record<AppId, string> = {
  logbook: '#4F46E5',
  burnlog: '#F97316',
  moneylog: '#22C55E',
  tasklog: '#3B82F6',
  homelog: '#9253DA',
  sociallog: '#A10059',
  shoppinglog: '#D46000',
  travellog: '#C2703A',
  learnlog: '#FF3366',
  adminlog: '#475569',
  intellog: '#8B5CF6',
  watchlog: '#DC2626',
};
