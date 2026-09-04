// lib/typography.ts
export const HEADING_FONTS = ['quicksand', 'poppins'] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];

export const BODY_FONTS = ['figtree', 'inter'] as const;
export type BodyFont = (typeof BODY_FONTS)[number];

export function isHeadingFont(value: unknown): value is HeadingFont {
  return typeof value === 'string' && (HEADING_FONTS as readonly string[]).includes(value);
}

export function isBodyFont(value: unknown): value is BodyFont {
  return typeof value === 'string' && (BODY_FONTS as readonly string[]).includes(value);
}

export const HEADING_FONT_LABELS: Record<HeadingFont, string> = {
  quicksand: 'Quicksand (default)',
  poppins: 'Poppins',
};

export const BODY_FONT_LABELS: Record<BodyFont, string> = {
  figtree: 'Figtree (default)',
  inter: 'Inter',
};

export const DEFAULT_HEADING_FONT: HeadingFont = 'quicksand';
export const DEFAULT_BODY_FONT: BodyFont = 'figtree';
