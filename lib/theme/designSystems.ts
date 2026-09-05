// lib/theme/designSystems.ts
//
// AdminLog > UI > Design Systems — curated one-click bundles of color,
// radius, and typography, inspired by well-known product design languages
// (see https://github.com/VoltAgent/awesome-design-md). These don't pull in
// new webfonts or a new settings table: applying a preset just writes to the
// two settings domains that already drive the whole app at global scope —
// AppTheme (colors + radius) and Typography (fonts/weight/scale) — via their
// existing APIs. So this is an approximation of each brand's look using
// fonts already loaded in RootLayoutClient, not a pixel-exact clone.

import type { AppThemeFields } from './appTheme';
import type { TypographyFields } from '../typography';

export interface DesignSystemPreset {
  id: string;
  name: string;
  description: string;
  theme: Required<Pick<AppThemeFields, 'primaryLight' | 'backgroundLight' | 'primaryDark' | 'backgroundDark' | 'radius'>>;
  typography: Required<Pick<TypographyFields, 'headingFont' | 'bodyFont' | 'headingWeight' | 'bodyWeight' | 'headingScale'>>;
}

export const DESIGN_SYSTEM_PRESETS: DesignSystemPreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Resets colors, radius, and typography back to each app’s built-in defaults.',
    theme: { primaryLight: null, backgroundLight: null, primaryDark: null, backgroundDark: null, radius: null },
    typography: { headingFont: null, bodyFont: null, headingWeight: null, bodyWeight: null, headingScale: null },
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Dense, technical, product-focused. Lavender-blue accent, tight radius, confident weight.',
    theme: {
      primaryLight: '#5e6ad2',
      backgroundLight: '#f7f8f8',
      primaryDark: '#828fff',
      backgroundDark: '#010102',
      radius: '0.5rem',
    },
    typography: { headingFont: 'inter', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Stark black-and-ink, sharp radius, monochrome-first with a single blue link accent.',
    theme: {
      primaryLight: '#171717',
      backgroundLight: '#ffffff',
      primaryDark: '#ededed',
      backgroundDark: '#0a0a0a',
      radius: '0.375rem',
    },
    typography: { headingFont: 'helvetica-style', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Financial-infrastructure polish. Electric indigo primary, soft canvas, rounder shape.',
    theme: {
      primaryLight: '#635bff',
      backgroundLight: '#f6f9fc',
      primaryDark: '#8d85ff',
      backgroundDark: '#0a2540',
      radius: '0.75rem',
    },
    typography: { headingFont: 'inter', bodyFont: 'inter', headingWeight: 300, bodyWeight: 400, headingScale: 1.1 },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'All-in-one workspace warmth. Purple primary, cream canvas, friendly geometric text.',
    theme: {
      primaryLight: '#5645d4',
      backgroundLight: '#fffefc',
      primaryDark: '#9a8cff',
      backgroundDark: '#191919',
      radius: '0.5rem',
    },
    typography: { headingFont: 'lexend', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
];

export function designSystemPreset(id: string | null | undefined): DesignSystemPreset | undefined {
  return DESIGN_SYSTEM_PRESETS.find((p) => p.id === id);
}
