// lib/theme/glowPalette.ts
//
// Shared hue source for cards that distinguish categories/items by color
// (wallet categories, trip cards, ...). Instead of each card inventing its
// own hex/Tailwind gradient, they cycle through the same 5-color chart
// palette (app/globals.css) via a stable per-item index — keeps items
// visually distinguishable while letting admin-controlled intensity
// (lib/theme/cardGlow.ts) apply uniformly across all of them.
const GLOW_PALETTE_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

export function glowColor(index: number): string {
  const safeIndex = ((index % GLOW_PALETTE_VARS.length) + GLOW_PALETTE_VARS.length) % GLOW_PALETTE_VARS.length;
  return `var(${GLOW_PALETTE_VARS[safeIndex]})`;
}

export function glowGradient(index: number, angle = 135): string {
  return `linear-gradient(${angle}deg, ${glowColor(index)}, ${glowColor(index + 1)})`;
}
