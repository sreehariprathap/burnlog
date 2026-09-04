// lib/watchlog/suggestions.ts
import { MOVIE_GENRES, TV_GENRES } from './tmdb';
import type { MediaType } from './types';

export const MOOD_CHIPS = [
  { id: 'light', label: 'Something light' },
  { id: 'mind-bending', label: 'Mind-bending' },
  { id: 'nostalgic', label: 'Nostalgic' },
  { id: 'feel-good', label: 'Feel-good' },
  { id: 'edge-of-seat', label: 'Edge of my seat' },
  { id: 'funny', label: 'Make me laugh' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'scary', label: 'Scare me' },
] as const;

export interface SuggestRequest {
  moods: string[];
  freeText: string | null;
  likedGenres: string[];
  preferredContentTypes: string[];
}

export interface SuggestFilters {
  mediaType: MediaType;
  genreIds: number[];
  minRating: number;
  rationale: string;
}

export function buildSuggestSystemPrompt(): string {
  const movieList = Object.entries(MOVIE_GENRES).map(([id, name]) => `${id}=${name}`).join(', ');
  const tvList = Object.entries(TV_GENRES).map(([id, name]) => `${id}=${name}`).join(', ');
  return `You are a movie/TV recommendation assistant for an app that fetches real titles from TMDB — you never invent titles yourself, you only choose search filters. Given a mood and taste history, respond with TMDB discover filters: whether to search movies or tv, which genre ids fit, and a minimum rating. Also write one short, warm sentence explaining why these filters match the mood.

Valid movie genre ids: ${movieList}.
Valid tv genre ids: ${tvList}.

Respond with ONLY valid JSON, no markdown, no prose, matching this schema exactly:
{"mediaType": "movie" | "tv", "genreIds": [number, ...], "minRating": number (0-10), "rationale": "one sentence"}`;
}

export function buildSuggestUserPrompt(req: SuggestRequest): string {
  const moodLine = req.moods.length > 0 ? `Moods: ${req.moods.join(', ')}.` : '';
  const freeTextLine = req.freeText ? `They also said: "${req.freeText}".` : '';
  const genresLine = req.likedGenres.length > 0
    ? `They've previously rated these genres highly: ${req.likedGenres.join(', ')}.`
    : "They don't have enough rated history yet — lean on the mood alone.";
  const contentTypesLine = req.preferredContentTypes.length > 0
    ? `They especially enjoy: ${req.preferredContentTypes.join(', ')}.`
    : '';

  return `${moodLine}\n${freeTextLine}\n${genresLine}\n${contentTypesLine}\n\nPick whichever of movie or tv best fits the mood, and 1-3 genre ids for it.`;
}

function isValidMediaType(v: unknown): v is MediaType {
  return v === 'movie' || v === 'tv';
}

export function validateSuggestResponse(raw: unknown): SuggestFilters {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;
  if (!isValidMediaType(r.mediaType)) {
    throw new Error('AI response has an invalid mediaType');
  }
  if (!Array.isArray(r.genreIds) || r.genreIds.length === 0 || !r.genreIds.every((g) => typeof g === 'number')) {
    throw new Error('AI response is missing a valid genreIds array');
  }
  if (typeof r.minRating !== 'number') {
    throw new Error('AI response is missing a numeric minRating');
  }
  if (typeof r.rationale !== 'string' || !r.rationale) {
    throw new Error('AI response is missing a rationale string');
  }

  return {
    mediaType: r.mediaType,
    genreIds: r.genreIds,
    minRating: Math.max(0, Math.min(10, r.minRating)),
    rationale: r.rationale,
  };
}
