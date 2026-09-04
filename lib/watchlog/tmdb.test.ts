import { describe, it, expect } from 'vitest';
import { mapTmdbResult, genreIdsToNames, MOVIE_GENRES, TV_GENRES } from './tmdb';

describe('mapTmdbResult', () => {
  it('maps a movie result, deriving mediaType, releaseYear, and genre names', () => {
    const raw = {
      id: 550,
      title: 'Fight Club',
      poster_path: '/abc.jpg',
      release_date: '1999-10-15',
      overview: 'A man...',
      vote_average: 8.4,
      genre_ids: [18, 53],
    };
    expect(mapTmdbResult(raw, 'movie')).toEqual({
      tmdbId: 550,
      mediaType: 'movie',
      title: 'Fight Club',
      posterPath: '/abc.jpg',
      releaseYear: 1999,
      overview: 'A man...',
      voteAverage: 8.4,
      genres: ['Drama', 'Thriller'],
    });
  });

  it('maps a tv result, using name/first_air_date instead of title/release_date', () => {
    const raw = {
      id: 1399,
      name: 'Game of Thrones',
      first_air_date: '2011-04-17',
      overview: 'Nine noble families...',
      vote_average: 8.4,
      genre_ids: [10765, 18],
    };
    expect(mapTmdbResult(raw, 'tv')).toEqual({
      tmdbId: 1399,
      mediaType: 'tv',
      title: 'Game of Thrones',
      posterPath: null,
      releaseYear: 2011,
      overview: 'Nine noble families...',
      voteAverage: 8.4,
      genres: ['Sci-Fi & Fantasy', 'Drama'],
    });
  });

  it('derives mediaType from raw.media_type when no hint is given (multi-search results)', () => {
    const raw = { id: 1, media_type: 'tv', name: 'Some Show', genre_ids: [] };
    expect(mapTmdbResult(raw).mediaType).toBe('tv');
  });

  it('falls back to null posterPath/releaseYear and empty overview/genres when missing', () => {
    const raw = { id: 2, title: 'No Poster', genre_ids: [] };
    const mapped = mapTmdbResult(raw, 'movie');
    expect(mapped.posterPath).toBeNull();
    expect(mapped.releaseYear).toBeNull();
    expect(mapped.overview).toBe('');
    expect(mapped.genres).toEqual([]);
  });
});

describe('genreIdsToNames', () => {
  it('maps movie genre ids to names, dropping unknown ids', () => {
    expect(genreIdsToNames([28, 99999], 'movie')).toEqual(['Action']);
  });

  it('maps tv genre ids to names using the tv-specific table', () => {
    expect(genreIdsToNames([10759], 'tv')).toEqual(['Action & Adventure']);
  });
});

describe('genre tables', () => {
  it('MOVIE_GENRES and TV_GENRES both include Drama at the same id (18)', () => {
    expect(MOVIE_GENRES[18]).toBe('Drama');
    expect(TV_GENRES[18]).toBe('Drama');
  });
});
