'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiFetch';
import { DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT, type HeadingFont, type BodyFont } from '@/lib/typography';

const TYPOGRAPHY_KEY = 'adminlog-typography-settings';

async function fetchTypography(): Promise<{ headingFont: HeadingFont; bodyFont: BodyFont }> {
  const res = await apiFetch('/api/adminlog/typography');
  if (!res.ok) return { headingFont: DEFAULT_HEADING_FONT, bodyFont: DEFAULT_BODY_FONT };
  return res.json();
}

/** Mounted once in RootLayoutClient. Points --font-quicksand/--font-figtree
 * (the variables every heading/body rule actually reads — see globals.css)
 * at whichever loaded next/font variable the admin picked in AdminLog >
 * UI > Typography, falling back to the real Quicksand/Figtree fonts when
 * left on their defaults. */
export function TypographySettingsEffect() {
  const { data } = useSWR(TYPOGRAPHY_KEY, fetchTypography, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    // next/font declares --font-quicksand/--font-figtree via a class on
    // <body> itself (see RootLayoutClient's className), so the override
    // must also be an inline style on <body> — one on <html> would just
    // lose to body's own (closer) declaration for anything body renders.
    const body = document.body;
    if (data?.headingFont === 'poppins') {
      body.style.setProperty('--font-quicksand', 'var(--font-poppins)');
    } else {
      body.style.removeProperty('--font-quicksand');
    }
    if (data?.bodyFont === 'inter') {
      body.style.setProperty('--font-figtree', 'var(--font-inter)');
    } else {
      body.style.removeProperty('--font-figtree');
    }
  }, [data]);

  return null;
}
