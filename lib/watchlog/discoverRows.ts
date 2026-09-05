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
