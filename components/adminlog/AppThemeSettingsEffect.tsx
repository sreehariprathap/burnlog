'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import { getActiveApp } from '@/lib/appMode';
import { resolveThemeField, type AppThemeFields } from '@/lib/theme/appTheme';

const APP_THEME_KEY = 'adminlog-app-theme-settings';

interface AppThemePayload {
  global: AppThemeFields;
  apps: Record<string, AppThemeFields>;
}

async function fetchAppTheme(): Promise<AppThemePayload> {
  const res = await apiFetch('/api/adminlog/app-theme');
  if (!res.ok) return { global: {}, apps: {} };
  return res.json();
}

/** Mounted once in RootLayoutClient. Every app's default primary/background
 * (light & dark) already lives in globals.css as `.app-<id>` /
 * `.app-<id>.dark` rules. This just overrides `--primary`/`--background`
 * inline on <html> — which always wins over those class-based rules,
 * regardless of which app/theme class is currently applied — with whatever
 * AdminLog > UI > App Theme has configured, per app-with-fallback-to-global,
 * per light/dark. Falls back to the CSS defaults (removeProperty) wherever
 * nothing is configured. */
export function AppThemeSettingsEffect() {
  const { data } = useSWR(APP_THEME_KEY, fetchAppTheme, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    function apply() {
      const payload = dataRef.current;
      const root = document.documentElement;
      const isDark = root.classList.contains('dark');
      const appOverride = payload?.apps[getActiveApp()];
      const global = payload?.global;

      const primary = resolveThemeField(
        isDark ? appOverride?.primaryDark : appOverride?.primaryLight,
        isDark ? global?.primaryDark : global?.primaryLight
      );
      const background = resolveThemeField(
        isDark ? appOverride?.backgroundDark : appOverride?.backgroundLight,
        isDark ? global?.backgroundDark : global?.backgroundLight
      );

      if (primary) root.style.setProperty('--primary', primary);
      else root.style.removeProperty('--primary');

      if (background) root.style.setProperty('--background', background);
      else root.style.removeProperty('--background');

      // Radius, spacing, border, and shadow: per-app override wins, else global.
      const radius = resolveThemeField(appOverride?.radius, global?.radius);
      if (radius) root.style.setProperty('--radius', radius);
      else root.style.removeProperty('--radius');

      const spacing = resolveThemeField(appOverride?.spacing, global?.spacing);
      if (spacing) root.style.setProperty('--spacing', spacing);
      else root.style.removeProperty('--spacing');

      const borderLight = resolveThemeField(appOverride?.borderLight, global?.borderLight);
      const borderDark = resolveThemeField(appOverride?.borderDark, global?.borderDark);
      const border = isDark ? borderDark : borderLight;
      if (border) root.style.setProperty('--border', border);
      else root.style.removeProperty('--border');

      const shadowTiers = [
        ['shadowXs', '--app-shadow-xs'],
        ['shadowSm', '--app-shadow-sm'],
        ['shadowMd', '--app-shadow-md'],
        ['shadowLg', '--app-shadow-lg'],
      ] as const;
      for (const [field, cssVar] of shadowTiers) {
        const value = resolveThemeField(appOverride?.[field as keyof typeof appOverride], global?.[field as keyof typeof global]);
        if (value) root.style.setProperty(cssVar, value);
        else root.style.removeProperty(cssVar);
      }
    }

    apply();

    // One observer catches both app switches (setAppTheme stamps
    // <html data-app> and swaps the `.app-<id>` class) and light/dark
    // toggles (ThemeProvider swaps `.light`/`.dark`). data-app is watched
    // as well as class because burnlog/adminlog/intellog have no theme
    // class, so switching between two of those changes no class at all.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-app'],
    });
    return () => observer.disconnect();
  }, [data]);

  return null;
}
