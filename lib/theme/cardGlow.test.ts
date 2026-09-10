import { describe, it, expect, vi } from 'vitest';

// cardGlow.ts imports apiFetch, which (via use-toast.tsx) pulls in JSX —
// vitest's default transform can't parse it (tsconfig.json sets
// jsx: "preserve" for Next's own build-time JSX handling). Mocking the
// module here means its real implementation, and therefore that transitive
// .tsx import, is never loaded — this test only exercises the pure
// preset-resolution logic below, not network fetching.
vi.mock('@/lib/apiFetch', () => ({ apiFetch: vi.fn() }));

const { isCardGlowPreset, resolveCardGlowPreset } = await import('./cardGlow');

describe('isCardGlowPreset', () => {
  it('accepts the three known presets', () => {
    expect(isCardGlowPreset('off')).toBe(true);
    expect(isCardGlowPreset('subtle')).toBe(true);
    expect(isCardGlowPreset('vibrant')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isCardGlowPreset('loud')).toBe(false);
    expect(isCardGlowPreset(null)).toBe(false);
    expect(isCardGlowPreset(undefined)).toBe(false);
    expect(isCardGlowPreset(1)).toBe(false);
  });
});

describe('resolveCardGlowPreset', () => {
  it('prefers the app-level preset when valid', () => {
    expect(resolveCardGlowPreset('vibrant', 'off')).toBe('vibrant');
  });

  it('falls back to the global preset when app-level is unset', () => {
    expect(resolveCardGlowPreset(undefined, 'off')).toBe('off');
    expect(resolveCardGlowPreset(null, 'off')).toBe('off');
  });

  it('falls back to subtle when neither is a valid preset', () => {
    expect(resolveCardGlowPreset(undefined, undefined)).toBe('subtle');
    expect(resolveCardGlowPreset('bogus', 'also-bogus')).toBe('subtle');
  });
});
