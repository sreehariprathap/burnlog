# WatchLog Onboarding, Home Redesign, Discover Expansion — Design Spec

Date: 2026-09-05

## Purpose

Five extensions to the existing WatchLog app (see `docs/superpowers/specs/2026-09-04-watchlog-design.md` for the original design):

1. An onboarding step that captures favorite genres and content types, and generates a first suggestion immediately.
2. Home's mood-chip picker replaced by a Siri-orb-triggered modal.
3. Home's suggestion display replaced by full-screen swipeable Deck cards.
4. Discover's search becomes a full-screen overlay with sort/filter.
5. Discover gains genre and regional browse rows beyond Trending.

Plus a movie/show trailer (YouTube embed) added to the shared detail sheet, prompted by a mid-design question about TMDB video data.

## Scope decisions

- **Onboarding registration**: WatchLog's onboarding page (`/watchlog/onboarding`) registers into the existing central `ONBOARDING_ROUTES` map in `app/onboarding/sequence/page.tsx` — the same mechanism every other app uses. No new orchestration.
- **The "AI job"**: onboarding's submit step calls the *existing* `POST /api/ai/watchlog/suggest` route synchronously with the picked genres as `likedGenres` — no new job infrastructure. Its result is logged to `ai_jobs` exactly like any other suggestion call, so Home's existing cache-restore-on-mount (built in the prior round) surfaces it automatically.
- **Genre + content-type capture**: two separate multi-select steps — genres (from TMDB's own `MOVIE_GENRES`/`TV_GENRES` tables), then content types (`movies`, `tv`, `anime`, `documentaries`, `stand-up`) as a distinct signal folded into the AI prompt.
- **Home orb replaces mood chips entirely** — not additive. Tapping the `SiriOrb` (existing component, already used elsewhere in this app) opens a `Drawer` with genre chips + free text; Submit regenerates and closes.
- **Home suggestion display**: Kibo UI's `Deck` component replaces last round's Stack/Grid tab switch entirely, not a third option. Swipe right = Add to Watchlist, swipe left = Ignore; Mark Watched is a button on the card (Tinder-style decks only have two swipe directions).
- **Discover search**: the existing inline `GooeyInput` becomes a trigger for a full-screen overlay (input + Sort dropdown + Movie/TV/All filter + results). Sort/filter apply to the search overlay only, not to the browse rows below.
- **Discover browse rows**: Trending (existing) + one row per top genre (Action, Comedy, Drama, Documentary, Animation, Horror, Romance) + two regional rows (Korean, Hindi) via TMDB's `original_language` filter. Genre/regional rows mix movies and TV, capped at ~15 items each, no rating floor.
- **Trailer**: TMDB's `/movie|tv/{id}/videos` endpoint returns YouTube video keys. A "Watch Trailer" section appears when scrolling down in `WatchDetailSheet`, rendering a standard YouTube `<iframe>` embed once the sheet opens (not eagerly on every card). The originally-requested shadcnblocks/Kibo UI `VideoPlayer` component was investigated and rejected — it wraps a native `<video src>` tag, which cannot play YouTube URLs (YouTube provides no direct file URLs; scraping its internal stream URLs would violate its ToS and break unpredictably).

## Architecture

New/changed pieces, all within the existing WatchLog app structure:

- **Schema**: two new `Profile` columns (`watchlogFavoriteGenres`, `watchlogContentTypes`), both `String[] @default([])`.
- **`lib/watchlog/suggestions.ts`**: `SuggestRequest` gains `preferredContentTypes: string[]`; `buildSuggestUserPrompt` includes it as an extra line when non-empty.
- **`lib/watchlog/tmdb.ts`**: new `fetchTrailerKey(tmdbId, mediaType, fetchImpl?)` (picks best YouTube trailer/teaser); `discoverTmdb`'s `DiscoverFilters` gains optional `originalLanguage?: string` and `minRating` becomes optional (default `0`) for browse-row use (as opposed to the AI suggestion flow's stricter floor).
- **`app/(watchlog)/watchlog/onboarding/`**: new page + `_components/WatchLogOnboardingFlow.tsx`, following `LearnLogOnboardingFlow`'s structure (step/total/returnTo query params, `TopBar` with close, spinner during the AI call).
- **`app/onboarding/sequence/page.tsx`**: add `watchlog: '/watchlog/onboarding'` to `ONBOARDING_ROUTES`.
- **`components/watchlog/WatchDetailSheet.tsx`**: add a trailer section (fetches `fetchTrailerKey` on open, renders a YouTube iframe below the existing content on scroll).
- **`app/(watchlog)/watchlog/_components/HomeContent.tsx`**: mood chips removed; `SiriOrb` + `Drawer` genre/free-text modal added; suggestion rendering switches to `Deck`.
- **`app/(watchlog)/watchlog/_components/DiscoverContent.tsx`**: search becomes a full-screen overlay trigger; additional `TitleCarousel` rows for genres/regions.
- **New component**: `components/ui/deck.tsx` (Kibo UI, installed via its shadcn-compatible registry — `https://www.kibo-ui.com/r/deck.json` — zero new dependencies, `@radix-ui/react-use-controllable-state` is already present).

## Data flow

- **Onboarding**: user picks genres → picks content types → submit saves both to `Profile` (via the existing Supabase client pattern, matching `learnLogCity`/`learnLogAiEnabled`) → calls `POST /api/ai/watchlog/suggest` with `{moods: [], freeText: null, likedGenres: pickedGenres, preferredContentTypes: pickedTypes}` → on success, continues the onboarding sequence via `returnTo`. The call's `runAiJob` logging means this exact response is what Home's cache-restore effect finds on first load — no separate "first suggestion" storage needed.
- **Home**: on mount, same cache-restore behavior as before (now typically finding the onboarding-seeded suggestion for new users). Suggestions render in a `Deck`; swiping right calls the existing `addWatchItem` flow (via `/api/watchlog/items`), swiping left calls the existing `/api/watchlog/ignore`, both already built. Tapping the orb opens the genre/free-text `Drawer`; submitting it calls suggest again and replaces the deck's contents.
- **Detail sheet trailer**: on sheet open, `fetchTrailerKey` runs (client calls a small new route, `GET /api/watchlog/tmdb/videos?tmdbId=&mediaType=`, since TMDB calls are server-side only per the existing convention). Result renders as a YouTube iframe further down the sheet; no key found means the section doesn't render at all.
- **Discover full-screen search**: tapping the search trigger opens an overlay; typing calls `/api/watchlog/tmdb/search` as before, sort/filter are applied client-side to the returned TMDB results (TMDB's own `sort_by` isn't available on `/search`, so sort here is a client-side re-order of whatever the search endpoint returns). Closing the overlay returns to the normal browse view (Trending + genre/regional rows).
- **Discover browse rows**: each row is a `discoverTmdb` call with a fixed `genreIds`/`originalLanguage`, rendered via the existing `TitleCarousel`.

## Error handling

- Onboarding's suggest call failing: same graceful-degrade already built into the suggest route (falls back to a plain popular-picks discover) — onboarding never blocks on AI failure, it always gets *some* result.
- Trailer fetch failing or no trailer found: the "Watch Trailer" section simply doesn't render — never a broken/empty player.
- Discover browse row fetch failing: that individual row is omitted (each row fetches independently), not a page-level error.

## Testing

- Unit tests: `buildSuggestUserPrompt` with `preferredContentTypes` (extends existing `suggestions.test.ts`); `fetchTrailerKey`'s selection logic (official trailer preferred, falls back correctly) in `tmdb.test.ts`; `discoverTmdb`'s `originalLanguage` param construction.
- No tests for the onboarding UI flow or Deck/orb interactions — matches this codebase's existing convention (components aren't unit-tested, only `lib/*` logic is).
