import { describe, it, expect } from 'vitest';
import { glowColor, glowGradient } from './glowPalette';

describe('glowColor', () => {
  it('maps 0-4 to chart-1 through chart-5', () => {
    expect(glowColor(0)).toBe('var(--chart-1)');
    expect(glowColor(4)).toBe('var(--chart-5)');
  });

  it('wraps positive indices past 5', () => {
    expect(glowColor(5)).toBe('var(--chart-1)');
    expect(glowColor(7)).toBe('var(--chart-3)');
  });

  it('wraps negative indices', () => {
    expect(glowColor(-1)).toBe('var(--chart-5)');
  });
});

describe('glowGradient', () => {
  it('builds a two-stop 135deg gradient by default', () => {
    expect(glowGradient(0)).toBe('linear-gradient(135deg, var(--chart-1), var(--chart-2))');
  });

  it('wraps the second stop past the palette end', () => {
    expect(glowGradient(4)).toBe('linear-gradient(135deg, var(--chart-5), var(--chart-1))');
  });

  it('accepts a custom angle', () => {
    expect(glowGradient(0, 90)).toBe('linear-gradient(90deg, var(--chart-1), var(--chart-2))');
  });
});
