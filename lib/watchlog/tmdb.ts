// lib/watchlog/tmdb.ts
import type { MediaType, TmdbItem } from './types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// TODO: SECURITY — remove this hardcoded fallback once TMDB_READ_ACCESS_TOKEN
// is set in the deployment dashboard, then rotate this token on
// themoviedb.org (a token committed to git must be treated as compromised
// even after it's removed from source).
const TMDB_READ_ACCESS_TOKEN =
  process.env.TMDB_READ_ACCESS_TOKEN ||
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMTY3N2Q5NDNkZTk1NWFiY2FiZmFjZWYyOWUwOTYzMCIsIm5iZiI6MTc4ODUxMTkwNC41NDIsInN1YiI6IjZhOWE4NmEwYTlmY2QzN2YwODFmOTE3YSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ov7OfcdWHskzTklvzL9UL2MuWGn8fYh1E-wCNWdwMxU';

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

interface RawTmdbResult {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  poster_path?: unknown;
  release_date?: unknown;
  first_air_date?: unknown;
  overview?: unknown;
  vote_average?: unknown;
  genre_ids?: unknown;
  media_type?: unknown;
}

export function mapTmdbResult(raw: unknown, mediaTypeHint?: MediaType): TmdbItem {
  const r = raw as RawTmdbResult;
  const mediaType: MediaType = mediaTypeHint ?? (r.media_type === 'tv' ? 'tv' : 'movie');
  const title = mediaType === 'movie' ? r.title : r.name;
  const dateStr = mediaType === 'movie' ? r.release_date : r.first_air_date;
  const genreIds = Array.isArray(r.genre_ids) ? r.genre_ids.filter((v): v is number => typeof v === 'number') : [];

  return {
    tmdbId: typeof r.id === 'number' ? r.id : 0,
    mediaType,
    title: typeof title === 'string' ? title : '',
    posterPath: typeof r.poster_path === 'string' ? r.poster_path : null,
    releaseYear: typeof dateStr === 'string' && dateStr.length >= 4 ? parseInt(dateStr.slice(0, 4), 10) : null,
    overview: typeof r.overview === 'string' ? r.overview : '',
    voteAverage: typeof r.vote_average === 'number' ? r.vote_average : 0,
    genres: genreIdsToNames(genreIds, mediaType),
  };
}

async function tmdbFetch(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${TMDB_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return res.json();
}

/** Multi-search (movies + tv together), for the Discover tab's search box. */
export async function searchTmdb(query: string, fetchImpl: typeof fetch = fetch): Promise<TmdbItem[]> {
  const json = (await tmdbFetch(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false`, fetchImpl)) as {
    results?: unknown[];
  };
  return (json.results ?? [])
    .filter((r) => (r as RawTmdbResult).media_type === 'movie' || (r as RawTmdbResult).media_type === 'tv')
    .map((r) => mapTmdbResult(r));
}

/** Trending titles for the Discover tab's browse grid. */
export async function trendingTmdb(
  window: 'day' | 'week' = 'week',
  fetchImpl: typeof fetch = fetch
): Promise<TmdbItem[]> {
  const json = (await tmdbFetch(`/trending/all/${window}`, fetchImpl)) as { results?: unknown[] };
  return (json.results ?? [])
    .filter((r) => (r as RawTmdbResult).media_type === 'movie' || (r as RawTmdbResult).media_type === 'tv')
    .map((r) => mapTmdbResult(r));
}

export interface DiscoverFilters {
  mediaType: MediaType;
  genreIds: number[];
  minRating?: number;
  originalLanguage?: string;
}

/** Filtered discovery used by the AI mood-suggestion flow and Discover's browse rows. */
export async function discoverTmdb(filters: DiscoverFilters, fetchImpl: typeof fetch = fetch): Promise<TmdbItem[]> {
  const params = new URLSearchParams({
    sort_by: 'popularity.desc',
    'vote_average.gte': String(filters.minRating ?? 0),
    'vote_count.gte': '50',
  });
  if (filters.genreIds.length > 0) params.set('with_genres', filters.genreIds.join(','));
  if (filters.originalLanguage) params.set('with_original_language', filters.originalLanguage);

  const json = (await tmdbFetch(`/discover/${filters.mediaType}?${params.toString()}`, fetchImpl)) as {
    results?: unknown[];
  };
  return (json.results ?? []).map((r) => mapTmdbResult(r, filters.mediaType));
}

interface RawTmdbVideo {
  site?: unknown;
  type?: unknown;
  official?: unknown;
  key?: unknown;
}

/** Best available YouTube trailer/teaser key for a title, or null if none exists. */
export async function fetchTrailerKey(
  tmdbId: number,
  mediaType: MediaType,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const json = (await tmdbFetch(`/${mediaType}/${tmdbId}/videos`, fetchImpl)) as { results?: unknown[] };
  const videos = (json.results ?? []).filter(
    (v): v is RawTmdbVideo => (v as RawTmdbVideo).site === 'YouTube'
  );

  const officialTrailer = videos.find((v) => v.type === 'Trailer' && v.official === true);
  const anyTrailer = videos.find((v) => v.type === 'Trailer');
  const anyTeaser = videos.find((v) => v.type === 'Teaser');
  const best = officialTrailer ?? anyTrailer ?? anyTeaser;
  return typeof best?.key === 'string' ? best.key : null;
}

export { BROWSE_GENRE_ROWS, REGIONAL_ROWS, type BrowseGenreRow, type RegionalRow } from './discoverRows';
