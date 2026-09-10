// lib/theme/cardGlow.ts
//
// Admin-controlled gradient/glow intensity for dashboard cards. Mirrors
// lib/theme/appTheme.ts's shape/pattern (fetcher, SWR key, resolve fn) —
// see CardGlowSettingsEffect for how this gets applied live as CSS vars.
import { apiFetch } from '@/lib/apiFetch';

export const CARD_GLOW_PRESETS = {
  off: { opacity: 0, blur: '0px', border: '0px' },
  subtle: { opacity: 0.12, blur: '24px', border: '1px' },
  vibrant: { opacity: 0.28, blur: '40px', border: '1.5px' },
} as const;

export type CardGlowPreset = keyof typeof CARD_GLOW_PRESETS;

export const CARD_GLOW_PRESET_KEYS = Object.keys(CARD_GLOW_PRESETS) as CardGlowPreset[];

export function isCardGlowPreset(value: unknown): value is CardGlowPreset {
  return typeof value === 'string' && value in CARD_GLOW_PRESETS;
}

export interface CardGlowFields {
  preset?: string | null;
}

export interface CardGlowPayload {
  global: CardGlowFields;
  apps: Record<string, CardGlowFields>;
}

export const CARD_GLOW_KEY = 'adminlog-card-glow-settings';

/** Shared SWR fetcher/key — import these rather than re-declaring, so every
 * caller (CardGlowSettingsEffect, the admin page) hits the same SWR cache
 * entry instead of issuing separate requests. */
export async function fetchCardGlow(): Promise<CardGlowPayload> {
  const res = await apiFetch('/api/adminlog/card-glow');
  if (!res.ok) return { global: {}, apps: {} };
  return res.json();
}

export function resolveCardGlowPreset(
  appPreset: string | null | undefined,
  globalPreset: string | null | undefined
): CardGlowPreset {
  if (isCardGlowPreset(appPreset)) return appPreset;
  if (isCardGlowPreset(globalPreset)) return globalPreset;
  return 'subtle';
}
