'use client';

// lib/theme/useAppThemeColors.ts
//
// Live per-app primary color, sourced from AdminLog > UI > App Theme
// (per-app override, else the global row, else the hardcoded default).
// Shares its SWR cache entry with AppThemeSettingsEffect — same key, same
// fetcher — so calling this costs no extra request.

import useSWR from 'swr';
import type { AppId } from '@/lib/appMode';
import { APP_THEME_KEY, fetchAppTheme, resolveThemeField } from '@/lib/theme/appTheme';
import { APP_COLOR_DEFAULTS } from '@/lib/theme/appColorDefaults';

export function useAppThemeColors() {
  const { data } = useSWR(APP_THEME_KEY, fetchAppTheme, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  function colorFor(appId: AppId): string {
    const override = data?.apps[appId];
    const global = data?.global;
    return resolveThemeField(override?.primaryLight, global?.primaryLight) ?? APP_COLOR_DEFAULTS[appId];
  }

  return { colorFor };
}
