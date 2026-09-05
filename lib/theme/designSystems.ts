// lib/theme/designSystems.ts
//
// AdminLog > UI > Design Systems — curated one-click bundles of color,
// shape (radius + spacing + border), elevation (shadows), and typography,
// inspired by well-known product design languages
// (see https://github.com/VoltAgent/awesome-design-md). Applying a preset
// just writes to the two settings domains that already drive the whole app
// at global scope — AppTheme (colors/radius/spacing/border/shadows) and
// Typography (fonts/weight/scale) — via their existing APIs, so no new
// settings table and no component file needed changing.
//
// This is an approximation, not a pixel-exact clone: fonts are picked from
// what's already loaded in RootLayoutClient (no new webfonts added), and
// every source system's own documented spacing scale turned out to share
// the same 4px base unit the app already defaults to — so `spacing` here is
// a deliberate density nudge (tighter for dense/technical systems, looser
// for generous/consumer ones), not a literally-extracted brand value.

import type { AppThemeFields } from './appTheme';
import type { TypographyFields } from '../typography';

type ThemeShape = Required<
  Pick<
    AppThemeFields,
    | 'primaryLight'
    | 'backgroundLight'
    | 'primaryDark'
    | 'backgroundDark'
    | 'radius'
    | 'spacing'
    | 'borderLight'
    | 'borderDark'
    | 'shadowXs'
    | 'shadowSm'
    | 'shadowMd'
    | 'shadowLg'
  >
>;

type TypographyShape = Required<
  Pick<TypographyFields, 'headingFont' | 'bodyFont' | 'headingWeight' | 'bodyWeight' | 'headingScale'>
>;

export interface DesignSystemPreset {
  id: string;
  name: string;
  description: string;
  theme: ThemeShape;
  typography: TypographyShape;
}

const NULL_THEME: ThemeShape = {
  primaryLight: null,
  backgroundLight: null,
  primaryDark: null,
  backgroundDark: null,
  radius: null,
  spacing: null,
  borderLight: null,
  borderDark: null,
  shadowXs: null,
  shadowSm: null,
  shadowMd: null,
  shadowLg: null,
};

const NULL_TYPOGRAPHY: TypographyShape = {
  headingFont: null,
  bodyFont: null,
  headingWeight: null,
  bodyWeight: null,
  headingScale: null,
};

export const DESIGN_SYSTEM_PRESETS: DesignSystemPreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Resets color, shape, elevation, and typography back to each app’s built-in defaults.',
    theme: NULL_THEME,
    typography: NULL_TYPOGRAPHY,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Dense, technical, product-focused. Lavender-blue accent, tight radius, flat hairline cards — no drop shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#5e6ad2',
      backgroundLight: '#f7f8f8',
      primaryDark: '#828fff',
      backgroundDark: '#010102',
      radius: '0.5rem',
      spacing: '0.225rem',
      borderLight: '#e4e4e7',
      borderDark: '#23252a',
      shadowXs: 'none',
      shadowSm: 'none',
      shadowMd: 'none',
      shadowLg: 'none',
    },
    typography: { headingFont: 'inter', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Stark black-and-ink, sharp radius, monochrome-first — borders carry the chrome, shadows stay barely there.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#171717',
      backgroundLight: '#ffffff',
      primaryDark: '#ededed',
      backgroundDark: '#0a0a0a',
      radius: '0.375rem',
      borderLight: '#ebebeb',
      borderDark: '#333333',
      shadowXs: '0 1px 2px rgba(0,0,0,0.04)',
      shadowSm: '0 1px 2px rgba(0,0,0,0.06)',
      shadowMd: '0 4px 8px rgba(0,0,0,0.08)',
      shadowLg: '0 8px 16px rgba(0,0,0,0.1)',
    },
    typography: { headingFont: 'helvetica-style', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Financial-infrastructure polish. Electric indigo primary, soft canvas, rounder shape, gentle layered shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#635bff',
      backgroundLight: '#f6f9fc',
      primaryDark: '#8d85ff',
      backgroundDark: '#0a2540',
      radius: '0.75rem',
      spacing: '0.26rem',
      borderLight: '#e3e8ee',
      borderDark: '#2a2d6b',
      shadowXs: '0 1px 2px rgba(16,24,40,0.05)',
      shadowSm: '0 1px 3px rgba(16,24,40,0.1), 0 1px 2px rgba(16,24,40,0.06)',
      shadowMd: '0 4px 8px rgba(16,24,40,0.1), 0 2px 4px rgba(16,24,40,0.06)',
      shadowLg: '0 12px 16px rgba(16,24,40,0.08), 0 4px 6px rgba(16,24,40,0.03)',
    },
    typography: { headingFont: 'inter', bodyFont: 'inter', headingWeight: 300, bodyWeight: 400, headingScale: 1.1 },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'All-in-one workspace warmth. Purple primary, cream canvas, friendly geometric text, soft warm shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#5645d4',
      backgroundLight: '#fffefc',
      primaryDark: '#9a8cff',
      backgroundDark: '#191919',
      radius: '0.5rem',
      spacing: '0.27rem',
      borderLight: '#e9e9e7',
      borderDark: '#2f2f2f',
      shadowXs: '0 1px 2px rgba(15,15,15,0.1)',
      shadowSm: '0 2px 4px rgba(15,15,15,0.1)',
      shadowMd: '0 4px 8px rgba(15,15,15,0.12)',
      shadowLg: '0 8px 24px rgba(15,15,15,0.18)',
    },
    typography: { headingFont: 'lexend', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    description: 'Warm, generous consumer marketplace. Rausch-red accent, big soft radius, roomy whitespace, gentle shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#ff385c',
      backgroundLight: '#ffffff',
      primaryDark: '#ff7088',
      backgroundDark: '#1a1a1a',
      radius: '0.875rem',
      spacing: '0.28rem',
      borderLight: '#dddddd',
      borderDark: '#3a3a3a',
      shadowXs: '0 1px 2px rgba(0,0,0,0.08)',
      shadowSm: '0 2px 4px rgba(0,0,0,0.1)',
      shadowMd: '0 4px 12px rgba(0,0,0,0.12)',
      shadowLg: '0 6px 16px rgba(0,0,0,0.16)',
    },
    typography: { headingFont: 'poppins', bodyFont: 'inter', headingWeight: 500, bodyWeight: 400, headingScale: 1 },
  },
  {
    id: 'raycast',
    name: 'Raycast',
    description: 'Dark, keyboard-first developer tool. Near-black canvas, hairline borders, tight radius — zero drop shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#ff6363',
      backgroundLight: '#f5f5f5',
      primaryDark: '#ff6363',
      backgroundDark: '#0d0d0d',
      radius: '0.5rem',
      spacing: '0.22rem',
      borderLight: '#e5e5e5',
      borderDark: '#242728',
      shadowXs: 'none',
      shadowSm: 'none',
      shadowMd: 'none',
      shadowLg: 'none',
    },
    typography: { headingFont: 'inter', bodyFont: 'inter', headingWeight: 600, bodyWeight: 400, headingScale: 0.9 },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Content-first darkness. Near-black surfaces, signature green accent, pill geometry, heavy elevated shadows.',
    theme: {
      ...NULL_THEME,
      primaryLight: '#1ed760',
      backgroundLight: '#f5f5f5',
      primaryDark: '#1ed760',
      backgroundDark: '#121212',
      radius: '0.5rem',
      borderLight: '#d1d1d1',
      borderDark: '#3e3e3e',
      shadowXs: '0 1px 2px rgba(0,0,0,0.4)',
      shadowSm: '0 2px 4px rgba(0,0,0,0.4)',
      shadowMd: '0 4px 8px rgba(0,0,0,0.4)',
      shadowLg: '0 8px 24px rgba(0,0,0,0.5)',
    },
    typography: { headingFont: 'berthold-style', bodyFont: 'inter', headingWeight: 700, bodyWeight: 400, headingScale: 1.1 },
  },
];

export function designSystemPreset(id: string | null | undefined): DesignSystemPreset | undefined {
  return DESIGN_SYSTEM_PRESETS.find((p) => p.id === id);
}
