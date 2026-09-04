# WatchLog — Design Spec

Date: 2026-09-04

## Purpose

New app for tracking and planning entertainment: theatre movies, home
movies, TV shows, anime, documentaries/specials. Includes AI-assisted
"what should I watch" suggestions based on mood and taste history, backed
by real movie/TV metadata (not AI-hallucinated titles).

## Scope decisions

- **Content types**: modeled as two entity types — `movie` and `tv` —
  matching TMDB's own classification, with a free-form `tags` field
  (`anime`, `documentary`, `stand-up`, etc.) layered on top rather than
  separate tables per type.
- **Status pipeline**: `want` → `watching` → `completed` (3 states, no
  "dropped" state).
- **Data source**: [TMDB](https://www.themoviedb.org/documentation/api)
  (The Movie Database) for all real metadata — search, trending, discover,
  posters, ratings, cast, runtime. New env var `TMDB_API_KEY`.
- **AI's role**: AI (OpenRouter, existing infra) is used only to translate
  a mood/vibe into TMDB query filters and to write short rationale text —
  never to invent titles. This avoids the hallucination risk that
  LearnLog's illustrative suggestions flow explicitly accepts for its
  "nearby classes" feature; WatchLog's picks are always real, TMDB-backed
  titles.
- **Suggestion UX**: mood/vibe quick-pick chips (e.g. "something light",
  "mind-bending", "nostalgic") plus optional free text — not an
  open-ended chat thread (IntelLog chat pattern rejected as too much
  friction/scope for this).
- **Passive recommendations**: a "For You" rail on the home tab,
  auto-refreshed, not only on-demand.
- **Page structure**: one page (`/watchlog`) with in-page tabs — Home,
  Watchlist, Discover, Stats — following the same collapsing pattern
  recently applied to ShoppingLog, SocialLog, and LearnLog, rather than
  separate routes per section.

## Architecture

New app under the existing per-app convention:

- `app/(watchlog)/watchlog/page.tsx` — single page, tabbed sections
  (Home / Watchlist / Discover / Stats), `layout.tsx`, `loading.tsx`.
- `app/(watchlog)/watchlog/_components/` — `HomeContent.tsx`,
  `WatchlistContent.tsx`, `DiscoverContent.tsx`, `StatsContent.tsx`, plus
  shared pieces (`WatchItemCard.tsx`, `MoodChips.tsx`, `AddToWatchlistButton.tsx`).
- `lib/watchlog/` — `tmdb.ts` (API client), `suggestions.ts` (mood→filter
  prompt building + response validation, mirrors `lib/learnlog/suggestions.ts`),
  `queries.ts` (WatchItem CRUD/queries), `types.ts`.
- `app/api/watchlog/` — `tmdb/search/route.ts`, `tmdb/trending/route.ts`,
  `suggest/route.ts`, `items/route.ts` (+ `[id]/route.ts` for status/rating updates).

Two independent fetch paths:

1. **TMDB** — real metadata, called server-side only (key never exposed
   client-side). Used directly for Discover/Search tab, and as the final
   step of the AI suggestion flow.
2. **OpenRouter** (existing `NEXT_OPENROUTER_KEY` infra, `AiModelSetting`/
   `CuratedModel` tables already support per-app model selection) — used
   only to reason over mood chips + taste history and emit a structured
   filter object, then to write a one-line rationale per result.

## Data model

Single new Prisma model, following existing conventions (`profileId` FK,
`@@map` snake_case, `dbgenerated("gen_random_uuid()")` id):

```prisma
model WatchItem {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profile        Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId      String    @db.Uuid
  tmdbId         Int
  mediaType      String    // 'movie' | 'tv'
  title          String
  posterPath     String?
  releaseYear    Int?
  runtimeMinutes Int?      // movie runtime, or avg episode runtime for tv
  genres         String[]  // TMDB genre names, cached at add-time
  tags           String[]  // user/AI tags: 'anime', 'documentary', 'stand-up', etc.
  status         String    @default("want") // 'want' | 'watching' | 'completed'
  rating         Int?      // 1-5, set on completion
  currentSeason  Int?
  currentEpisode Int?
  notes          String?
  addedAt        DateTime  @default(now())
  completedAt    DateTime?
  updatedAt      DateTime  @default(now()) @updatedAt

  @@unique([profileId, tmdbId, mediaType])
  @@index([profileId, status])
  @@map("watch_items")
}
```

No local TMDB cache table — Discover/Search hit TMDB live (generous free
tier); only the fields needed for display are copied onto `WatchItem` at
add-time. AI suggestion logging reuses the existing `AiJob` table
(`app: 'watchlog'`), including as the de-facto cache for the "For You"
rail (see Data flow).

## Data flow

- **Discover/Search tab**: client calls `GET /api/watchlog/tmdb/search?q=`
  or `/api/watchlog/tmdb/trending` → server calls TMDB → results rendered
  with an "Add to Watchlist" action that writes a `WatchItem` (status `want`).
- **Mood-picker (Home)**: user taps mood chips + optional free text →
  `POST /api/watchlog/suggest` → server builds a prompt from chips + the
  profile's `WatchItem` history (genres rated ≥ 4) → OpenRouter returns
  structured JSON (`{ genreIds, keywords, minRating, era }`) → server
  calls TMDB `/discover` with those params → OpenRouter writes a one-line
  "why this fits" rationale per result → response returned to client,
  logged to `AiJob` (`jobType: 'watch_suggest'`).
- **"For You" home rail**: same suggestion pipeline, auto-triggered on
  home-tab load. No new cache table — check the most recent `AiJob` for
  this profile/app/jobType; if its `createdAt` is within 24h, reuse its
  `output` JSON; otherwise recompute and log a new job. Mirrors IntelLog's
  daily-snapshot cadence without adding new infrastructure.
- **Watchlist tab**: reads `WatchItem` filtered by `status`, `mediaType`, `tags`.
- **Stats tab**: aggregates `WatchItem` — count by genre, average rating,
  estimated hours watched (`runtimeMinutes` × count, with episode count
  factored in for `tv`).

## Error handling

- TMDB unreachable/rate-limited: show an empty state with retry; adding
  items manually is not blocked (though search/discover need TMDB, so
  this primarily affects those two flows).
- OpenRouter failure during mood-suggest: fall back to a plain TMDB
  `/discover` call using only the chip-mapped genre IDs (no AI reasoning
  layer) so the feature degrades gracefully instead of erroring out.

## Testing

- Unit tests: TMDB response → `WatchItem`-shape mapping; mood-chip → filter
  prompt builder and response validator (same test shape as
  `lib/learnlog/suggestions.ts` / `queries.test.ts`); status-transition
  logic (`want`/`watching`/`completed`, `completedAt`/`rating` side effects).
- TMDB and OpenRouter calls are mocked in tests — no live external calls
  in the test suite.
- No e2e coverage for TMDB itself; existing app conventions for
  component/integration tests apply to the new UI.
