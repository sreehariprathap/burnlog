'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import { getActiveApp } from '@/lib/appMode';
import {
  fontCatalogEntry,
  resolveTypographyField,
  DEFAULT_HEADING_FONT,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_WEIGHT,
  DEFAULT_BODY_WEIGHT,
  DEFAULT_HEADING_SCALE,
  type TypographyFields,
} from '@/lib/typography';

const TYPOGRAPHY_KEY = 'adminlog-typography-settings';

interface TypographyPayload {
  global: TypographyFields;
  apps: Record<string, TypographyFields>;
}

async function fetchTypography(): Promise<TypographyPayload> {
  const res = await apiFetch('/api/adminlog/typography');
  if (!res.ok) return { global: {}, apps: {} };
  return res.json();
}

/** Mounted once in RootLayoutClient. Resolves the effective heading/body
 * font, weight, and heading size scale for whichever app is currently
 * active (app override > global > hardcoded default — see
 * resolveTypographyField) and applies them as CSS custom properties. */
export function TypographySettingsEffect() {
  const { data } = useSWR(TYPOGRAPHY_KEY, fetchTypography, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    function apply() {
      const payload = dataRef.current;
      const global = payload?.global ?? {};
      const appOverride = payload?.apps[getActiveApp()] ?? {};

      const headingFontId = resolveTypographyField(appOverride.headingFont, global.headingFont, DEFAULT_HEADING_FONT);
      const bodyFontId = resolveTypographyField(appOverride.bodyFont, global.bodyFont, DEFAULT_BODY_FONT);
      const headingWeight = resolveTypographyField(appOverride.headingWeight, global.headingWeight, DEFAULT_HEADING_WEIGHT);
      const bodyWeight = resolveTypographyField(appOverride.bodyWeight, global.bodyWeight, DEFAULT_BODY_WEIGHT);
      const headingScale = resolveTypographyField(appOverride.headingScale, global.headingScale, DEFAULT_HEADING_SCALE);

      // next/font declares --font-quicksand/--font-figtree via a class on
      // <body> itself (see RootLayoutClient's className), so pointing them
      // at a different loaded font must also be an inline style on <body> —
      // one on <html> would just lose to body's own (closer) declaration
      // for anything body renders.
      const body = document.body;
      const headingCssVar = fontCatalogEntry(headingFontId)?.cssVar;
      if (headingCssVar && headingCssVar !== '--font-quicksand') {
        body.style.setProperty('--font-quicksand', `var(${headingCssVar})`);
      } else {
        body.style.removeProperty('--font-quicksand');
      }
      const bodyCssVar = fontCatalogEntry(bodyFontId)?.cssVar;
      if (bodyCssVar && bodyCssVar !== '--font-figtree') {
        body.style.setProperty('--font-figtree', `var(${bodyCssVar})`);
      } else {
        body.style.removeProperty('--font-figtree');
      }

      // Weight/scale are plain custom properties (no descendant redeclares
      // them), so setting them on <html> is fine — they just inherit down.
      const root = document.documentElement;
      root.style.setProperty('--typography-heading-weight', String(headingWeight));
      root.style.setProperty('--typography-body-weight', String(bodyWeight));
      root.style.setProperty('--typography-heading-scale', String(headingScale));
    }

    apply();

    // Catches app switches, which change which app's override applies.
    // data-app is the reliable signal (setAppTheme stamps it on every
    // switch); class alone misses switches between the three apps that
    // have no theme class of their own.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-app'],
    });
    return () => observer.disconnect();
  }, [data]);

  return null;
}
