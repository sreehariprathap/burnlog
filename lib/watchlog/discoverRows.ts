import type { MediaType } from './types';

export const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery',
  10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

export function genreIdsToNames(ids: number[], mediaType: MediaType): string[] {
  const table = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return ids.map((id) => table[id]).filter((name): name is string => Boolean(name));
}

export interface BrowseGenreRow {
  label: string;
  movieGenreId: number;
  tvGenreId?: number;
}

/** Discover's genre browse rows — Horror and Romance have no direct TMDB TV
 * genre equivalent, so those rows are movie-only. */
export const BROWSE_GENRE_ROWS: BrowseGenreRow[] = [
  { label: 'Action', movieGenreId: 28, tvGenreId: 10759 },
  { label: 'Comedy', movieGenreId: 35, tvGenreId: 35 },
  { label: 'Drama', movieGenreId: 18, tvGenreId: 18 },
  { label: 'Documentary', movieGenreId: 99, tvGenreId: 99 },
  { label: 'Animation', movieGenreId: 16, tvGenreId: 16 },
  { label: 'Horror', movieGenreId: 27 },
  { label: 'Romance', movieGenreId: 10749 },
];

export interface RegionalRow {
  label: string;
  originalLanguage: string;
}

export const REGIONAL_ROWS: RegionalRow[] = [
  { label: 'Korean', originalLanguage: 'ko' },
  { label: 'Hindi', originalLanguage: 'hi' },
];
