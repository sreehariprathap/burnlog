import { describe, it, expect } from 'vitest';
import { buildSuggestUserPrompt, validateSuggestResponse, MOOD_CHIPS } from './suggestions';

describe('MOOD_CHIPS', () => {
  it('has at least 6 mood options, each with an id and label', () => {
    expect(MOOD_CHIPS.length).toBeGreaterThanOrEqual(6);
    for (const chip of MOOD_CHIPS) {
      expect(typeof chip.id).toBe('string');
      expect(typeof chip.label).toBe('string');
    }
  });
});

describe('buildSuggestUserPrompt', () => {
  it('includes selected mood labels, free text, and liked genres', () => {
    const prompt = buildSuggestUserPrompt({
      moods: ['light', 'nostalgic'],
      freeText: 'something with a good soundtrack',
      likedGenres: ['Comedy', 'Drama'],
      preferredContentTypes: [],
    });
    expect(prompt).toContain('light');
    expect(prompt).toContain('nostalgic');
    expect(prompt).toContain('something with a good soundtrack');
    expect(prompt).toContain('Comedy');
    expect(prompt).toContain('Drama');
  });

  it('omits the free-text line when freeText is null', () => {
    const prompt = buildSuggestUserPrompt({ moods: ['funny'], freeText: null, likedGenres: [], preferredContentTypes: [] });
    expect(prompt).not.toContain('null');
  });

  it('includes preferredContentTypes as an extra line when present', () => {
    const prompt = buildSuggestUserPrompt({
      moods: [],
      freeText: null,
      likedGenres: [],
      preferredContentTypes: ['anime', 'documentaries'],
    });
    expect(prompt).toContain('anime');
    expect(prompt).toContain('documentaries');
  });

  it('omits the content-type line when preferredContentTypes is empty', () => {
    const prompt = buildSuggestUserPrompt({ moods: ['funny'], freeText: null, likedGenres: [], preferredContentTypes: [] });
    expect(prompt.toLowerCase()).not.toContain('especially enjoy');
  });
});

describe('validateSuggestResponse', () => {
  it('accepts a well-formed response', () => {
    const raw = {
      mediaType: 'movie',
      genreIds: [35, 18],
      minRating: 6.5,
      rationale: 'Light dramas with heart fit a nostalgic, feel-good mood.',
    };
    expect(validateSuggestResponse(raw)).toEqual(raw);
  });

  it('rejects a response missing genreIds', () => {
    expect(() => validateSuggestResponse({ mediaType: 'movie', minRating: 5, rationale: 'x' })).toThrow();
  });

  it('rejects an invalid mediaType', () => {
    expect(() =>
      validateSuggestResponse({ mediaType: 'anime', genreIds: [1], minRating: 5, rationale: 'x' })
    ).toThrow();
  });

  it('clamps minRating into 0-10 if the model returns an out-of-range value', () => {
    const raw = { mediaType: 'tv', genreIds: [18], minRating: 15, rationale: 'x' };
    expect(validateSuggestResponse(raw).minRating).toBe(10);
  });
});
