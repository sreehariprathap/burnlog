'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { getActiveApp } from '@/lib/appMode';
import { CARD_GLOW_KEY, CARD_GLOW_PRESETS, fetchCardGlow, resolveCardGlowPreset } from '@/lib/theme/cardGlow';

/** Mounted once in RootLayoutClient. Resolves the active app's glow preset
 * (app override → global → "subtle" default) and writes it as CSS custom
 * properties on <html> — --card-glow-opacity/--card-glow-blur/--card-glow-border
 * — that every migrated glow/gradient card reads from. Same
 * SWR-key-sharing, fail-open, MutationObserver-on-app-switch shape as
 * AppThemeSettingsEffect. */
export function CardGlowSettingsEffect() {
  const { data } = useSWR(CARD_GLOW_KEY, fetchCardGlow, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    function apply() {
      const payload = dataRef.current;
      const root = document.documentElement;
      const appPreset = payload?.apps[getActiveApp()]?.preset;
      const globalPreset = payload?.global?.preset;
      const resolved = resolveCardGlowPreset(appPreset, globalPreset);
      const values = CARD_GLOW_PRESETS[resolved];

      root.style.setProperty('--card-glow-opacity', String(values.opacity));
      root.style.setProperty('--card-glow-blur', values.blur);
      root.style.setProperty('--card-glow-border', values.border);
    }

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-app'],
    });
    return () => observer.disconnect();
  }, [data]);

  return null;
}
