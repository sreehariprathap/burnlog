'use client';

import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import { BUTTON_SLOTS, DEFAULT_BUTTON_STYLE, isButtonStyle, type ButtonStyle } from '@/lib/buttonThemes';

async function fetchButtonThemeSettings(): Promise<Record<string, ButtonStyle>> {
  const res = await apiFetch('/api/adminlog/button-theme');
  if (!res.ok) {
    const fallback: Record<string, ButtonStyle> = {};
    for (const slot of BUTTON_SLOTS) fallback[slot.key] = DEFAULT_BUTTON_STYLE;
    return fallback;
  }
  const data = await res.json();
  const settings: Record<string, ButtonStyle> = {};
  for (const [key, value] of Object.entries(data.settings ?? {})) {
    settings[key] = isButtonStyle(value) ? value : DEFAULT_BUTTON_STYLE;
  }
  return settings;
}

/** Global admin-configured style for one button "slot" (see BUTTON_SLOTS).
 * Shared across every consumer via SWR's cache — one fetch per session,
 * not one per button. */
export function useButtonTheme(slot: string): ButtonStyle {
  const { data } = useSWR('button-theme-settings', fetchButtonThemeSettings, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return data?.[slot] ?? DEFAULT_BUTTON_STYLE;
}
