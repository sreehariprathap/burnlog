'use client';

import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import { useActiveApp } from '@/lib/useActiveApp';
import { BUTTON_SLOTS, DEFAULT_BUTTON_STYLE, isButtonStyle, type ButtonStyle } from '@/lib/buttonThemes';

interface ButtonThemePayload {
  global: Record<string, ButtonStyle>;
  apps: Record<string, Record<string, ButtonStyle>>;
}

function coerce(raw: unknown): Record<string, ButtonStyle> {
  const out: Record<string, ButtonStyle> = {};
  for (const [key, value] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    if (isButtonStyle(value)) out[key] = value;
  }
  return out;
}

async function fetchButtonThemeSettings(): Promise<ButtonThemePayload> {
  const fallback: Record<string, ButtonStyle> = {};
  for (const slot of BUTTON_SLOTS) fallback[slot.key] = DEFAULT_BUTTON_STYLE;

  const res = await apiFetch('/api/adminlog/button-theme');
  if (!res.ok) return { global: fallback, apps: {} };

  const data = await res.json();
  const apps: Record<string, Record<string, ButtonStyle>> = {};
  for (const [appId, slots] of Object.entries((data.apps ?? {}) as Record<string, unknown>)) {
    apps[appId] = coerce(slots);
  }
  return { global: { ...fallback, ...coerce(data.global) }, apps };
}

/** Admin-configured style for one button "slot" (see BUTTON_SLOTS),
 * resolved per-app-over-global the same way app theme and typography are.
 * Shared across every consumer via SWR's cache — one fetch per session,
 * not one per button — and re-resolves when the active app changes. */
export function useButtonTheme(slot: string): ButtonStyle {
  const activeApp = useActiveApp();
  const { data } = useSWR('button-theme-settings', fetchButtonThemeSettings, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return data?.apps[activeApp]?.[slot] ?? data?.global[slot] ?? DEFAULT_BUTTON_STYLE;
}
