// lib/watchlog/types.ts
export type MediaType = 'movie' | 'tv';
export type WatchStatus = 'want' | 'watching' | 'completed';

export interface TmdbItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  overview: string;
  voteAverage: number;
  genres: string[];
}

export interface WatchItemRow {
  id: string;
  profileId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  tags: string[];
  status: WatchStatus;
  rating: number | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  notes: string | null;
  addedAt: string;
  completedAt: string | null;
  updatedAt: string;
}
