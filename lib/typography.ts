// lib/typography.ts
//
// AdminLog > UI > Typography — a catalog of fonts (grouped into categories),
// pickable as either the heading or body font, plus heading weight, body
// weight, and a heading size scale. Configurable globally and per app, with
// app-level values taking precedence over global (see resolveTypographyField
// and TypographySettingsEffect).
//
// 7 of the originally-requested names (Proxima Nova, Cooper, Avant Garde,
// Recoletta, Berthold, Sailors, Helvetica) aren't legally available as free
// font files, so those entries are free Google Font *lookalikes* — labeled
// as such rather than passed off as the real thing.

export type FontCategory = 'sans-serif' | 'serif' | 'slab-serif' | 'display';

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  'slab-serif': 'Slab serif',
  display: 'Display',
};

export interface FontCatalogEntry {
  id: string;
  label: string;
  /** The --font-* CSS variable (declared in RootLayoutClient) this entry points at. */
  cssVar: string;
  category: FontCategory;
  /** True for fonts Google only ships as a single static weight — the
   * weight picker should be hidden/locked to 400 for these. */
  singleWeight?: boolean;
}

export const FONT_CATALOG: FontCatalogEntry[] = [
  { id: 'quicksand', label: 'Quicksand (default heading)', cssVar: '--font-quicksand', category: 'sans-serif' },
  { id: 'figtree', label: 'Figtree (default body)', cssVar: '--font-figtree', category: 'sans-serif' },
  { id: 'poppins', label: 'Poppins', cssVar: '--font-poppins', category: 'sans-serif' },
  { id: 'inter', label: 'Inter', cssVar: '--font-inter', category: 'sans-serif' },
  { id: 'krona-one', label: 'Krona One', cssVar: '--font-krona-one', category: 'display', singleWeight: true },
  { id: 'prata', label: 'Prata', cssVar: '--font-prata', category: 'serif', singleWeight: true },
  { id: 'lexend', label: 'Lexend', cssVar: '--font-lexend', category: 'sans-serif' },
  { id: 'calistoga', label: 'Calistoga', cssVar: '--font-calistoga', category: 'display', singleWeight: true },
  { id: 'mulish', label: 'Mulish', cssVar: '--font-mulish', category: 'sans-serif' },
  { id: 'proxima-nova-style', label: 'Proxima Nova style (Work Sans)', cssVar: '--font-work-sans', category: 'sans-serif' },
  { id: 'cooper-style', label: 'Cooper Black style (Bevan)', cssVar: '--font-bevan', category: 'slab-serif', singleWeight: true },
  { id: 'avant-garde-style', label: 'Avant Garde style (Poppins)', cssVar: '--font-poppins', category: 'sans-serif' },
  { id: 'recoletta-style', label: 'Recoletta style (Fraunces)', cssVar: '--font-fraunces', category: 'serif' },
  { id: 'berthold-style', label: 'Berthold style (Archivo)', cssVar: '--font-archivo', category: 'sans-serif' },
  { id: 'sailors-style', label: 'Sailors style (Righteous)', cssVar: '--font-righteous', category: 'display', singleWeight: true },
  { id: 'helvetica-style', label: 'Helvetica style (Arimo)', cssVar: '--font-arimo', category: 'sans-serif' },
];

export function isFontId(value: unknown): value is string {
  return typeof value === 'string' && FONT_CATALOG.some((f) => f.id === value);
}

export function fontCatalogEntry(id: string | null | undefined): FontCatalogEntry | undefined {
  return FONT_CATALOG.find((f) => f.id === id);
}

export const WEIGHT_OPTIONS = [300, 400, 500, 600, 700] as const;
export type FontWeight = (typeof WEIGHT_OPTIONS)[number];

export const WEIGHT_LABELS: Record<FontWeight, string> = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
};

export function isFontWeight(value: unknown): value is FontWeight {
  return typeof value === 'number' && (WEIGHT_OPTIONS as readonly number[]).includes(value);
}

export const HEADING_SCALE_OPTIONS = [0.85, 0.9, 1, 1.1, 1.2, 1.3] as const;
export type HeadingScale = (typeof HEADING_SCALE_OPTIONS)[number];

export const HEADING_SCALE_LABELS: Record<HeadingScale, string> = {
  0.85: 'Small',
  0.9: 'Slightly small',
  1: 'Default',
  1.1: 'Slightly large',
  1.2: 'Large',
  1.3: 'Extra large',
};

export function isHeadingScale(value: unknown): value is HeadingScale {
  return typeof value === 'number' && (HEADING_SCALE_OPTIONS as readonly number[]).includes(value);
}

export const DEFAULT_HEADING_FONT = 'quicksand';
export const DEFAULT_BODY_FONT = 'figtree';
export const DEFAULT_HEADING_WEIGHT: FontWeight = 600;
export const DEFAULT_BODY_WEIGHT: FontWeight = 400;
export const DEFAULT_HEADING_SCALE: HeadingScale = 1;

export interface TypographyFields {
  headingFont?: string | null;
  bodyFont?: string | null;
  headingWeight?: number | null;
  bodyWeight?: number | null;
  headingScale?: number | null;
}

/** app override wins, else global, else the hardcoded fallback. */
export function resolveTypographyField<T>(
  appValue: T | null | undefined,
  globalValue: T | null | undefined,
  fallback: T
): T {
  if (appValue !== null && appValue !== undefined) return appValue;
  if (globalValue !== null && globalValue !== undefined) return globalValue;
  return fallback;
}
