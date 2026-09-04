# WatchLog Onboarding, Home Redesign, Discover Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WatchLog onboarding step (genres + content types → first AI suggestion), replace Home's mood chips with a Siri-orb modal and its suggestion display with swipeable Deck cards, expand Discover into a full-screen search with sort/filter plus genre/regional browse rows, and add a YouTube trailer to the detail sheet.

**Architecture:** Every piece extends the existing WatchLog app from `docs/superpowers/specs/2026-09-04-watchlog-design.md` — no new subsystems. The "AI job" for onboarding is a direct call to the already-built `/api/ai/watchlog/suggest` route; its `ai_jobs` log entry is what Home's existing cache-restore effect picks up. `Deck` (Kibo UI) is installed the same way the prior round's Aceternity/kokonutui components were — via its shadcn-compatible registry JSON, hand-applied rather than through the interactive CLI (which was prone to interactive overwrite prompts on shared files last time).

**Tech Stack:** Same as the existing WatchLog app — Next.js App Router, Supabase JS client for runtime data, TMDB v3 API, OpenRouter via the existing `runAiJob`/`getModel` infra, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-watchlog-onboarding-and-home-redesign.md`

## Global Constraints

- Onboarding registers into the existing `ONBOARDING_ROUTES` map in `app/onboarding/sequence/page.tsx` — do not build a separate orchestration mechanism.
- No new AI job infrastructure — reuse `POST /api/ai/watchlog/suggest` as-is (extended for `preferredContentTypes`), which already logs to `ai_jobs` via `runAiJob`.
- The Deck component is Kibo UI's real, unmodified source (from `https://www.kibo-ui.com/r/deck.json`) — do not hand-write a custom swipe implementation.
- Trailer playback is a plain YouTube `<iframe>` embed — never attempt to resolve a YouTube video into a direct file URL for a native `<video>` tag (violates YouTube's ToS and is unreliable).
- All new TMDB calls stay server-side (existing convention: `lib/watchlog/tmdb.ts` functions are only ever called from `app/api/watchlog/*` routes, never imported into client components).

---

## Task 1: Profile fields for onboarding preferences

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260905100000_add_watchlog_onboarding_prefs/migration.sql`

**Interfaces:**
- Produces: `profiles.watchlogFavoriteGenres` and `profiles.watchlogContentTypes` columns, read/written via the Supabase client (matching `learnLogCity`'s pattern) — consumed by Task 8 (onboarding flow).

- [ ] **Step 1: Add the fields to `model Profile` in `prisma/schema.prisma`**

Find `learnLogCity` / `learnLogAiEnabled` in the `Profile` model and add nearby:

```prisma
  watchlogFavoriteGenres   String[] @default([])
  watchlogContentTypes     String[] @default([]) // 'movies' | 'tv' | 'anime' | 'documentaries' | 'stand-up'
```

- [ ] **Step 2: Write the migration**

```sql
-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "watchlogFavoriteGenres" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN     "watchlogContentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
```

- [ ] **Step 3: Apply and regenerate**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration applies cleanly (if it errors with a column-already-exists P3018 on an *earlier*, unrelated migration — a known pre-existing drift issue in this database from concurrent work — verify the drifted migration's columns/tables actually exist via a direct query, then `npx prisma migrate resolve --applied <name>` for that one migration only, and retry. Never resolve a migration you haven't verified matches the live schema.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260905100000_add_watchlog_onboarding_prefs
git commit -m "feat(watchlog): add onboarding preference fields to Profile"
```

---

## Task 2: Suggestion prompt gains content-type preferences

**Files:**
- Modify: `lib/watchlog/suggestions.ts`
- Modify: `lib/watchlog/suggestions.test.ts`

**Interfaces:**
- Produces: `SuggestRequest.preferredContentTypes: string[]` — consumed by Task 8 (onboarding) and the existing `/api/ai/watchlog/suggest` route (Task 2's route change).
- Modify: `app/api/ai/watchlog/suggest/route.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/watchlog/suggestions.test.ts`, inside the existing `describe('buildSuggestUserPrompt', ...)` block:

```typescript
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/watchlog/suggestions.test.ts`
Expected: FAIL — `preferredContentTypes` doesn't exist on the request type / prompt doesn't include it.

- [ ] **Step 3: Update `lib/watchlog/suggestions.ts`**

```typescript
export interface SuggestRequest {
  moods: string[];
  freeText: string | null;
  likedGenres: string[];
  preferredContentTypes: string[];
}
```

```typescript
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/watchlog/suggestions.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Thread the field through the suggest route**

In `app/api/ai/watchlog/suggest/route.ts`, update the request-body parsing:

```typescript
    const body = (await request.json()) as Partial<SuggestRequest>;
    const req: SuggestRequest = {
      moods: Array.isArray(body.moods) ? body.moods : [],
      freeText: body.freeText ?? null,
      likedGenres: Array.isArray(body.likedGenres) ? body.likedGenres : [],
      preferredContentTypes: Array.isArray(body.preferredContentTypes) ? body.preferredContentTypes : [],
    };
```

(This is the only change needed in the route — `req` already flows into `buildSuggestUserPrompt` unchanged.)

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors (the `GET` handler's cached-response shape is untyped `input`/`output` from Supabase, so it isn't affected).

```bash
git add lib/watchlog/suggestions.ts lib/watchlog/suggestions.test.ts app/api/ai/watchlog/suggest/route.ts
git commit -m "feat(watchlog): thread preferredContentTypes into suggestion prompt"
```

---

## Task 3: TMDB trailer lookup and browse-row filters

**Files:**
- Modify: `lib/watchlog/tmdb.ts`
- Modify: `lib/watchlog/tmdb.test.ts`

**Interfaces:**
- Produces: `fetchTrailerKey(tmdbId, mediaType, fetchImpl?)`, `BROWSE_GENRE_ROWS`, `REGIONAL_ROWS`, updated `DiscoverFilters` (optional `originalLanguage`, optional `minRating`) — consumed by Task 4 (videos route), Task 5 (discover route), Task 10 (Discover UI).

- [ ] **Step 1: Write the failing tests**

Add to `lib/watchlog/tmdb.test.ts`:

```typescript
import { fetchTrailerKey, discoverTmdb } from './tmdb';

describe('fetchTrailerKey', () => {
  function fakeFetch(results: unknown[]): typeof fetch {
    return (async () =>
      new Response(JSON.stringify({ results }), { status: 200 })) as unknown as typeof fetch;
  }

  it('prefers an official YouTube Trailer', async () => {
    const results = [
      { site: 'YouTube', type: 'Teaser', official: true, key: 'teaser-key' },
      { site: 'YouTube', type: 'Trailer', official: false, key: 'unofficial-key' },
      { site: 'YouTube', type: 'Trailer', official: true, key: 'official-key' },
    ];
    const key = await fetchTrailerKey(550, 'movie', fakeFetch(results));
    expect(key).toBe('official-key');
  });

  it('falls back to any Trailer if no official one exists', async () => {
    const results = [{ site: 'YouTube', type: 'Trailer', official: false, key: 'unofficial-key' }];
    const key = await fetchTrailerKey(550, 'movie', fakeFetch(results));
    expect(key).toBe('unofficial-key');
  });

  it('falls back to a Teaser if no Trailer exists at all', async () => {
    const results = [{ site: 'YouTube', type: 'Teaser', official: false, key: 'teaser-key' }];
    const key = await fetchTrailerKey(550, 'movie', fakeFetch(results));
    expect(key).toBe('teaser-key');
  });

  it('ignores non-YouTube results and returns null if nothing usable is found', async () => {
    const results = [{ site: 'Vimeo', type: 'Trailer', official: true, key: 'vimeo-key' }];
    const key = await fetchTrailerKey(550, 'movie', fakeFetch(results));
    expect(key).toBeNull();
  });
});

describe('discoverTmdb with originalLanguage', () => {
  it('includes with_original_language when provided', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await discoverTmdb({ mediaType: 'movie', genreIds: [], originalLanguage: 'ko' }, fetchImpl);
    expect(capturedUrl).toContain('with_original_language=ko');
  });

  it('defaults minRating to 0 when omitted', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await discoverTmdb({ mediaType: 'movie', genreIds: [] }, fetchImpl);
    expect(capturedUrl).toContain('vote_average.gte=0');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/watchlog/tmdb.test.ts`
Expected: FAIL — `fetchTrailerKey` doesn't exist; `discoverTmdb` rejects the new shape / doesn't default `minRating`.

- [ ] **Step 3: Update `lib/watchlog/tmdb.ts`**

Change `DiscoverFilters` and `discoverTmdb`:

```typescript
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
```

Add trailer lookup and the browse-row category tables at the end of the file:

```typescript
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
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npx vitest run lib/watchlog/tmdb.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Update the one existing `discoverTmdb` caller for the now-optional `minRating`**

In `app/api/ai/watchlog/suggest/route.ts`, the existing call already passes `minRating: filters.minRating` explicitly — no change needed there (it still works with the optional field). Run `npx tsc --noEmit` to confirm.

- [ ] **Step 6: Commit**

```bash
git add lib/watchlog/tmdb.ts lib/watchlog/tmdb.test.ts
git commit -m "feat(watchlog): add trailer lookup and browse-row genre/regional tables"
```

---

## Task 4: Trailer API route

**Files:**
- Create: `app/api/watchlog/tmdb/videos/route.ts`

**Interfaces:**
- Consumes: `fetchTrailerKey` (Task 3).
- Produces: `GET /api/watchlog/tmdb/videos?tmdbId=&mediaType=` → `{ trailerKey: string | null }`, consumed by Task 6 (WatchDetailSheet).

- [ ] **Step 1: Write the route**

```typescript
// app/api/watchlog/tmdb/videos/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchTrailerKey } from '@/lib/watchlog/tmdb';
import type { MediaType } from '@/lib/watchlog/types';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const tmdbId = Number(params.get('tmdbId'));
    const mediaType = params.get('mediaType') as MediaType | null;
    if (!tmdbId || (mediaType !== 'movie' && mediaType !== 'tv')) {
      return NextResponse.json({ error: 'tmdbId and a valid mediaType are required' }, { status: 400 });
    }

    const trailerKey = await fetchTrailerKey(tmdbId, mediaType);
    return NextResponse.json({ trailerKey });
  } catch (error) {
    console.error('watchlog tmdb videos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, curl unauthenticated: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/watchlog/tmdb/videos?tmdbId=550&mediaType=movie"`.
Expected: `401` (auth gate works; full behavior verified logged-in in Task 6).

- [ ] **Step 3: Commit**

```bash
git add app/api/watchlog/tmdb/videos
git commit -m "feat(watchlog): add trailer lookup API route"
```

---

## Task 5: Discover browse-row API route

**Files:**
- Create: `app/api/watchlog/tmdb/discover/route.ts`

**Interfaces:**
- Consumes: `discoverTmdb` (Task 3).
- Produces: `GET /api/watchlog/tmdb/discover?movieGenreId=&tvGenreId=&originalLanguage=` → `{ results: TmdbItem[] }`, consumed by Task 10 (Discover browse rows).

- [ ] **Step 1: Write the route**

```typescript
// app/api/watchlog/tmdb/discover/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverTmdb } from '@/lib/watchlog/tmdb';
import type { TmdbItem } from '@/lib/watchlog/types';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const movieGenreId = params.get('movieGenreId');
    const tvGenreId = params.get('tvGenreId');
    const originalLanguage = params.get('originalLanguage') ?? undefined;

    if (!movieGenreId && !originalLanguage) {
      return NextResponse.json({ error: 'movieGenreId or originalLanguage is required' }, { status: 400 });
    }

    const calls: Promise<TmdbItem[]>[] = [];
    if (movieGenreId || originalLanguage) {
      calls.push(discoverTmdb({ mediaType: 'movie', genreIds: movieGenreId ? [Number(movieGenreId)] : [], originalLanguage }));
    }
    if (tvGenreId) {
      calls.push(discoverTmdb({ mediaType: 'tv', genreIds: [Number(tvGenreId)] }));
    }

    const settled = await Promise.all(calls);
    const results = settled.flat().slice(0, 15);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('watchlog tmdb discover error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, curl unauthenticated: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/watchlog/tmdb/discover?movieGenreId=28&tvGenreId=10759"`.
Expected: `401` (auth gate; full logged-in behavior verified in Task 10).

- [ ] **Step 3: Commit**

```bash
git add app/api/watchlog/tmdb/discover
git commit -m "feat(watchlog): add Discover browse-row API route"
```

---

## Task 6: Trailer section in the detail sheet

**Files:**
- Modify: `components/watchlog/WatchDetailSheet.tsx`

**Interfaces:**
- Consumes: `GET /api/watchlog/tmdb/videos` (Task 4).
- Produces: trailer section rendered in the existing `WatchDetailSheet`, used by Discover (Task 10) and Home's Deck cards (Task 9) — no prop changes needed, it fetches internally based on the existing `item` prop.

- [ ] **Step 1: Add the trailer fetch and rendering**

In `components/watchlog/WatchDetailSheet.tsx`, add imports and a small effect:

```typescript
import { useEffect, useState } from 'react';
```

(add alongside the existing imports)

Inside the component, before the `return`:

```typescript
  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) {
      setTrailerKey(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/watchlog/tmdb/videos?tmdbId=${item.tmdbId}&mediaType=${item.mediaType}`)
      .then((res) => (res.ok ? res.json() : { trailerKey: null }))
      .then((json) => {
        if (!cancelled) setTrailerKey(json.trailerKey ?? null);
      })
      .catch(() => {
        if (!cancelled) setTrailerKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item]);
```

Add the trailer section after the existing action buttons block (still inside the scrollable `<div className="overflow-y-auto px-4 pb-8">`):

```typescript
          {trailerKey && (
            <div className="mt-6">
              <p className="text-sm font-medium mb-2">Trailer</p>
              <div className="aspect-video w-full overflow-hidden rounded-xl">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${trailerKey}`}
                  title="Trailer"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify end-to-end**

Run: `npm run dev`, log in, open Discover, tap any card with a trailer available (most popular titles have one).
Expected: scrolling down in the detail sheet reveals a "Trailer" heading with a playable YouTube embed; titles with no trailer show no such section (no broken/empty player).

- [ ] **Step 4: Commit**

```bash
git add components/watchlog/WatchDetailSheet.tsx
git commit -m "feat(watchlog): add YouTube trailer embed to detail sheet"
```

---

## Task 7: Install the Deck component

**Files:**
- Create: `components/ui/deck.tsx`

**Interfaces:**
- Produces: `Deck`, `DeckCards`, `DeckItem`, `DeckEmpty` (Kibo UI's real API — `DeckCards` takes `onSwipe(index, direction)`, `stackSize`, `threshold`) — consumed by Task 9 (HomeContent).

- [ ] **Step 1: Confirm the dependency is already present**

Run: `grep -n "@radix-ui/react-use-controllable-state" package.json`
Expected: a match (already a dependency — no `npm install` needed).

- [ ] **Step 2: Fetch and write the component**

Run: `curl -s "https://www.kibo-ui.com/r/deck.json" -o /tmp/kibo-deck.json`

Then write `components/ui/deck.tsx` with the exact content from that registry's `files[0].content` field (extract via `python3 -c "import json; print(json.load(open('/tmp/kibo-deck.json'))['files'][0]['content'])" > components/ui/deck.tsx`), prefixed with a one-line attribution comment:

```typescript
// components/ui/deck.tsx
// Vendored from Kibo UI (https://www.kibo-ui.com/components/deck), MIT.
```

(The fetched content already starts with `"use client";` and defines `Deck`, `DeckCards`, `DeckCard`, `DeckItem`, `DeckEmpty` exactly as shown in this plan's research — do not modify its logic, only prepend the attribution comment.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `@radix-ui/react-use-controllable-state`'s types don't resolve, double-check Step 1's grep matched — the package must already be installed, not just declared.)

- [ ] **Step 4: Commit**

```bash
git add components/ui/deck.tsx
git commit -m "feat(watchlog): vendor Kibo UI's Deck component"
```

---

## Task 8: WatchLog onboarding

**Files:**
- Create: `app/(watchlog)/watchlog/onboarding/page.tsx`
- Create: `app/(watchlog)/watchlog/onboarding/_components/WatchLogOnboardingFlow.tsx`
- Modify: `app/onboarding/sequence/page.tsx`

**Interfaces:**
- Consumes: `MOVIE_GENRES`, `TV_GENRES` (Task 3, already existed), `POST /api/ai/watchlog/suggest` (Task 2's extended body).
- Produces: `/watchlog/onboarding` route wired into the app-selection onboarding sequence.

- [ ] **Step 1: Register the route**

In `app/onboarding/sequence/page.tsx`, add to `ONBOARDING_ROUTES`:

```typescript
  watchlog: '/watchlog/onboarding',
```

- [ ] **Step 2: Write `app/(watchlog)/watchlog/onboarding/page.tsx`**

```typescript
// app/(watchlog)/watchlog/onboarding/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { WatchLogOnboardingFlow } from './_components/WatchLogOnboardingFlow';

export const metadata: Metadata = { title: 'Set up WatchLog' };

export default function WatchLogOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <WatchLogOnboardingFlow />
    </Suspense>
  );
}
```

- [ ] **Step 3: Write `app/(watchlog)/watchlog/onboarding/_components/WatchLogOnboardingFlow.tsx`**

```typescript
// app/(watchlog)/watchlog/onboarding/_components/WatchLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { OnboardingProgressBar } from '@/components/onboarding/OnboardingProgressBar';
import { appSearchColor } from '@/lib/search/registry';
import { MOVIE_GENRES, TV_GENRES } from '@/lib/watchlog/tmdb';
import { cn } from '@/lib/utils';

const GENRE_OPTIONS = Array.from(new Set([...Object.values(MOVIE_GENRES), ...Object.values(TV_GENRES)])).sort();

const CONTENT_TYPE_OPTIONS = [
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'anime', label: 'Anime' },
  { id: 'documentaries', label: 'Documentaries' },
  { id: 'stand-up', label: 'Stand-up' },
];

function ChipPicker({ options, selected, onToggle }: { options: string[]; selected: Set<string>; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onToggle(option)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition-colors',
            selected.has(option)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-foreground border-border'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function WatchLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/watchlog';
  const onboardingStep = Number(searchParams.get('step'));
  const onboardingTotal = Number(searchParams.get('total'));
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const supabase = createClient();

  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      next.has(genre) ? next.delete(genre) : next.add(genre);
      return next;
    });
  }

  function toggleType(id: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (!profile) return;
    setSaving(true);
    try {
      const genres = Array.from(selectedGenres);
      const contentTypes = Array.from(selectedTypes);

      const { error } = await supabase
        .from('profiles')
        .update({ watchlogFavoriteGenres: genres, watchlogContentTypes: contentTypes })
        .eq('id', profile.id);
      if (error) throw error;

      // Seed a first suggestion — same endpoint Home's mood picker calls,
      // logged to ai_jobs, which Home's cache-restore effect reads on
      // first load. A failure here shouldn't block onboarding: Home's own
      // "never start empty" fallback will generate one anyway.
      await fetch('/api/ai/watchlog/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moods: [], freeText: null, likedGenres: genres, preferredContentTypes: contentTypes }),
      }).catch(() => {});

      router.push(returnTo);
    } catch (err) {
      toast({ title: 'Could not save your preferences', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Set up WatchLog" onClose={() => router.push(returnTo)} />
      {onboardingStep > 0 && onboardingTotal > 0 && (
        <OnboardingProgressBar current={onboardingStep} total={onboardingTotal} color={appSearchColor('watchlog')} />
      )}
      <div className="p-4 flex flex-col gap-6">
        <section className="space-y-3">
          <p className="text-sm font-medium">What genres do you enjoy?</p>
          <ChipPicker options={GENRE_OPTIONS} selected={selectedGenres} onToggle={toggleGenre} />
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium">What kind of content?</p>
          <ChipPicker
            options={CONTENT_TYPE_OPTIONS.map((t) => t.label)}
            selected={new Set(Array.from(selectedTypes).map((id) => CONTENT_TYPE_OPTIONS.find((t) => t.id === id)?.label ?? id))}
            onToggle={(label) => {
              const opt = CONTENT_TYPE_OPTIONS.find((t) => t.label === label);
              if (opt) toggleType(opt.id);
            }}
          />
        </section>

        <Button onClick={handleContinue} disabled={saving}>
          {saving ? 'Setting up...' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, log in, visit `/watchlog/onboarding?step=1&total=1&returnTo=/watchlog` directly.
Expected: genre and content-type chips render and toggle; "Continue" saves to `profiles` (verify via a `SELECT watchlogFavoriteGenres, watchlogContentTypes FROM profiles WHERE id = '<your id>'` query) and navigates to `/watchlog`; a new row appears in `ai_jobs` for `jobType: 'watchlog-suggest'`.

- [ ] **Step 6: Commit**

```bash
git add "app/(watchlog)/watchlog/onboarding" app/onboarding/sequence/page.tsx
git commit -m "feat(watchlog): add onboarding step for favorite genres and content types"
```

---

## Task 9: Home — Siri orb modal replaces mood chips; Deck replaces Stack/Grid

**Files:**
- Modify: `app/(watchlog)/watchlog/_components/HomeContent.tsx`
- Delete: `app/(watchlog)/watchlog/_components/MoodChips.tsx` (no longer used — mood chips are replaced by genre chips in the new orb modal)
- Delete: `app/(watchlog)/watchlog/_components/SuggestionResults.tsx` (replaced by the Deck rendering built directly in `HomeContent.tsx`, since it's now a much smaller amount of markup than the old Stack/Grid switch)

**Interfaces:**
- Consumes: `Deck`, `DeckCards`, `DeckItem`, `DeckEmpty` (Task 7); `SiriOrb` (existing `components/smoothui/siri-orb`); `MOVIE_GENRES`/`TV_GENRES` (existing).
- Produces: the redesigned Home suggestion UI.

- [ ] **Step 1: Rewrite `app/(watchlog)/watchlog/_components/HomeContent.tsx`**

```typescript
// app/(watchlog)/watchlog/_components/HomeContent.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { watchItemsQuery } from '@/lib/watchlog/queries';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import { WatchDetailSheet } from '@/components/watchlog/WatchDetailSheet';
import { Deck, DeckCards, DeckItem, DeckEmpty } from '@/components/ui/deck';
import SiriOrb from '@/components/smoothui/siri-orb';
import { MOVIE_GENRES, TV_GENRES } from '@/lib/watchlog/tmdb';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Star } from 'lucide-react';
import type { TmdbItem } from '@/lib/watchlog/types';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const GENRE_OPTIONS = Array.from(new Set([...Object.values(MOVIE_GENRES), ...Object.values(TV_GENRES)])).sort();

interface SuggestResponse {
  rationale: string;
  results: TmdbItem[];
}

async function fetchSuggestions(genres: string[], freeText: string | null): Promise<SuggestResponse> {
  const res = await fetch('/api/ai/watchlog/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moods: [], freeText, likedGenres: genres, preferredContentTypes: [] }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? 'Suggestion request failed');
  }
  return res.json();
}

interface CachedSuggestion {
  request: { likedGenres?: string[]; freeText?: string | null } | null;
  response: SuggestResponse | null;
}

async function fetchCachedSuggestion(): Promise<CachedSuggestion | null> {
  const res = await fetch('/api/ai/watchlog/suggest');
  if (!res.ok) return null;
  const json = await res.json();
  return json.cached ?? null;
}

export function HomeContent() {
  const { toast } = useToast();
  const { profile } = useCurrentProfile();
  const watchingQuery = profile ? watchItemsQuery(profile.id, 'watching') : null;
  const { data: watching, isLoading: watchingLoading } = useSWR(watchingQuery?.key ?? null, watchingQuery?.fetcher ?? null);

  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [restoringSuggestion, setRestoringSuggestion] = useState(true);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [deckIndex, setDeckIndex] = useState(0);
  const [detail, setDetail] = useState<TmdbItem | null>(null);

  const [orbOpen, setOrbOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState('');

  async function regenerate(genres: string[], text: string) {
    setLoadingSuggestion(true);
    try {
      const result = await fetchSuggestions(genres, text || null);
      setSuggestion(result);
      setDeckIndex(0);
    } catch (err) {
      toast({ title: 'Could not generate suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoadingSuggestion(false);
    }
  }

  const initializedForProfile = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || initializedForProfile.current === profile.id) return;
    initializedForProfile.current = profile.id;
    (async () => {
      try {
        const cached = await fetchCachedSuggestion();
        if (cached?.response) {
          setSelectedGenres(new Set(cached.request?.likedGenres ?? []));
          setFreeText(cached.request?.freeText ?? '');
          setSuggestion(cached.response);
        } else {
          await regenerate([], '');
        }
      } finally {
        setRestoringSuggestion(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      next.has(genre) ? next.delete(genre) : next.add(genre);
      return next;
    });
  }

  async function handleOrbSubmit() {
    await regenerate(Array.from(selectedGenres), freeText);
    setOrbOpen(false);
  }

  async function handleAdd(item: TmdbItem, status: 'want' | 'completed' = 'want') {
    const res = await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status }),
    });
    if (res.ok) {
      toast({ description: status === 'completed' ? `Marked "${item.title}" as watched` : `Added "${item.title}" to your watchlist` });
    }
  }

  async function handleIgnore(item: TmdbItem) {
    await fetch('/api/watchlog/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: item.tmdbId, mediaType: item.mediaType }),
    });
  }

  const results = suggestion?.results ?? [];

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="WatchLog" />
      <div className="p-4 flex flex-col gap-6">
        {(watching ?? []).length > 0 && (
          <section>
            <p className="text-sm font-medium mb-2">Continue watching</p>
            {watchingLoading ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(watching ?? []).map((item) => (
                  <WatchItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Suggestions for you</p>
            <button type="button" onClick={() => setOrbOpen(true)} aria-label="Regenerate suggestions">
              <SiriOrb size="40px" state={loadingSuggestion ? 'thinking' : 'idle'} />
            </button>
          </div>

          {suggestion?.rationale && <p className="text-sm text-muted-foreground">{suggestion.rationale}</p>}

          {restoringSuggestion || (loadingSuggestion && results.length === 0) ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : (
            <Deck className="h-[480px] w-full max-w-sm mx-auto">
              <DeckCards
                currentIndex={deckIndex}
                onCurrentIndexChange={setDeckIndex}
                onSwipe={(index, direction) => {
                  const item = results[index];
                  if (!item) return;
                  if (direction === 'right') handleAdd(item);
                  else handleIgnore(item);
                }}
              >
                {results.map((item) => (
                  <DeckItem key={`${item.mediaType}-${item.tmdbId}`} className="flex-col overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => setDetail(item)}
                      className="relative h-3/4 w-full overflow-hidden bg-muted"
                    >
                      {item.posterPath ? (
                        <Image src={`${TMDB_IMG_BASE}${item.posterPath}`} alt={item.title} fill className="object-cover" />
                      ) : null}
                    </button>
                    <div className="flex w-full flex-1 flex-col justify-between p-3">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-current" />
                          {item.voteAverage.toFixed(1)} · {item.releaseYear ?? ''}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => handleAdd(item, 'completed')}>
                        Mark Watched
                      </Button>
                    </div>
                  </DeckItem>
                ))}
                <DeckEmpty>
                  <p className="text-sm">That's everything — tap the orb for more.</p>
                </DeckEmpty>
              </DeckCards>
            </Deck>
          )}
          <p className="text-center text-xs text-muted-foreground">Swipe right to add, left to skip</p>
        </section>
      </div>

      <Drawer open={orbOpen} onOpenChange={setOrbOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>What are you in the mood for?</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8 space-y-4">
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    selectedGenres.has(genre)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border'
                  )}
                >
                  {genre}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Anything else? (optional)"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <Button onClick={handleOrbSubmit} disabled={loadingSuggestion} className="w-full">
              {loadingSuggestion ? 'Thinking...' : 'Regenerate'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <WatchDetailSheet
        item={detail}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        onAdd={detail ? () => { handleAdd(detail); setDetail(null); } : undefined}
        onMarkWatched={detail ? () => { handleAdd(detail, 'completed'); setDetail(null); } : undefined}
        onIgnore={detail ? () => { handleIgnore(detail); setDetail(null); } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the now-unused files**

```bash
git rm "app/(watchlog)/watchlog/_components/MoodChips.tsx" "app/(watchlog)/watchlog/_components/SuggestionResults.tsx"
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (`'idle'` and `'thinking'` are both valid members of `components/smoothui/ai-core`'s `AIState` union, confirmed against its source).

- [ ] **Step 4: Manually verify end-to-end**

Run: `npm run dev`, log in, visit `/watchlog`.
Expected: a Deck of suggestion cards renders; swiping right adds to watchlist (verify in Watchlist tab), swiping left ignores (verify it doesn't reappear after tapping the orb and regenerating); tapping "Mark Watched" marks it completed; tapping a card's poster opens the detail sheet; tapping the orb opens the genre/free-text drawer, and Regenerate replaces the deck's contents.

- [ ] **Step 5: Run the full test suite and commit**

Run: `npx vitest run`
Expected: all tests pass (HomeContent has no unit tests, per this codebase's convention — this just confirms nothing else broke).

```bash
git add "app/(watchlog)/watchlog/_components/HomeContent.tsx"
git commit -m "feat(watchlog): replace Home mood chips with Siri-orb modal and Deck suggestions"
```

---

## Task 10: Discover — full-screen search with sort/filter, genre and regional rows

**Files:**
- Modify: `app/(watchlog)/watchlog/_components/DiscoverContent.tsx`

**Interfaces:**
- Consumes: `GET /api/watchlog/tmdb/discover` (Task 5), `BROWSE_GENRE_ROWS`/`REGIONAL_ROWS` (Task 3).

- [ ] **Step 1: Rewrite `app/(watchlog)/watchlog/_components/DiscoverContent.tsx`**

```typescript
// app/(watchlog)/watchlog/_components/DiscoverContent.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { GooeyInput } from '@/components/ui/gooey-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { TitleCarousel } from '@/components/watchlog/TitleCarousel';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import { WatchDetailSheet } from '@/components/watchlog/WatchDetailSheet';
import { BROWSE_GENRE_ROWS, REGIONAL_ROWS } from '@/lib/watchlog/tmdb';
import type { TmdbItem } from '@/lib/watchlog/types';

type SortOption = 'popularity' | 'rating' | 'newest';
type MediaFilter = 'all' | 'movie' | 'tv';

async function fetchTrending(): Promise<TmdbItem[]> {
  const res = await fetch('/api/watchlog/tmdb/trending');
  const json = await res.json();
  return json.results ?? [];
}

async function fetchBrowseRow(movieGenreId?: number, tvGenreId?: number, originalLanguage?: string): Promise<TmdbItem[]> {
  const params = new URLSearchParams();
  if (movieGenreId) params.set('movieGenreId', String(movieGenreId));
  if (tvGenreId) params.set('tvGenreId', String(tvGenreId));
  if (originalLanguage) params.set('originalLanguage', originalLanguage);
  const res = await fetch(`/api/watchlog/tmdb/discover?${params.toString()}`);
  const json = await res.json();
  return json.results ?? [];
}

async function fetchSearch(query: string): Promise<TmdbItem[]> {
  const res = await fetch(`/api/watchlog/tmdb/search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  return json.results ?? [];
}

function sortResults(results: TmdbItem[], sort: SortOption): TmdbItem[] {
  const sorted = [...results];
  if (sort === 'rating') sorted.sort((a, b) => b.voteAverage - a.voteAverage);
  else if (sort === 'newest') sorted.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0));
  return sorted;
}

function BrowseRow({ label, movieGenreId, tvGenreId, originalLanguage, onSelect }: {
  label: string;
  movieGenreId?: number;
  tvGenreId?: number;
  originalLanguage?: string;
  onSelect: (item: TmdbItem) => void;
}) {
  const { data, isLoading } = useSWR(
    ['watchlog-browse', label],
    () => fetchBrowseRow(movieGenreId, tvGenreId, originalLanguage)
  );
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;
  return <TitleCarousel title={label} items={data ?? []} onSelect={onSelect} />;
}

export function DiscoverContent() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('popularity');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [selected, setSelected] = useState<TmdbItem | null>(null);
  const { toast } = useToast();

  const { data: trending, isLoading: trendingLoading } = useSWR('watchlog-trending', fetchTrending);
  const { data: searchResults, isLoading: searchLoading } = useSWR(
    query.length > 1 ? ['watchlog-search', query] : null,
    () => fetchSearch(query)
  );

  const filteredSearchResults = sortResults(
    (searchResults ?? []).filter((r) => mediaFilter === 'all' || r.mediaType === mediaFilter),
    sort
  );

  async function addItem(item: TmdbItem, status: 'want' | 'completed' = 'want') {
    const res = await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast({ title: 'Could not add', description: json.error ?? 'Unknown error', variant: 'destructive' });
      return;
    }
    toast({ description: status === 'completed' ? `Marked "${item.title}" as watched` : `Added "${item.title}" to your watchlist` });
    setSelected(null);
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Discover" />
      <div className="p-4 space-y-6">
        <div className="flex justify-center">
          <button type="button" onClick={() => setSearchOpen(true)} className="w-full max-w-sm">
            <GooeyInput placeholder="Search movies & TV..." className="pointer-events-none w-full" />
          </button>
        </div>

        {trendingLoading ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : (
          <TitleCarousel title="Trending This Week" items={trending ?? []} onSelect={setSelected} />
        )}

        {BROWSE_GENRE_ROWS.map((row) => (
          <BrowseRow key={row.label} label={row.label} movieGenreId={row.movieGenreId} tvGenreId={row.tvGenreId} onSelect={setSelected} />
        ))}

        {REGIONAL_ROWS.map((row) => (
          <BrowseRow key={row.label} label={row.label} originalLanguage={row.originalLanguage} onSelect={setSelected} />
        ))}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 p-4">
            <GooeyInput placeholder="Search movies & TV..." value={query} onValueChange={setQuery} className="flex-1" />
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popularity">Popularity</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mediaFilter} onValueChange={(v) => setMediaFilter(v as MediaFilter)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="movie">Movies</SelectItem>
                <SelectItem value="tv">TV</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {query.length <= 1 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Start typing to search.</p>
            ) : searchLoading ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredSearchResults.map((item) => (
                  <WatchItemCard
                    key={`${item.mediaType}-${item.tmdbId}`}
                    item={item}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <WatchDetailSheet
        item={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        onAdd={selected ? () => addItem(selected) : undefined}
        onMarkWatched={selected ? () => addItem(selected, 'completed') : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manually verify end-to-end**

Run: `npm run dev`, log in, visit `/watchlog?tab=discover`.
Expected: Trending row plus one row per genre (Action, Comedy, Drama, Documentary, Animation, Horror, Romance) and two regional rows (Korean, Hindi) all render with real titles; tapping the search bar opens a full-screen overlay; typing shows results as a plain grid; the Sort and Type selects visibly reorder/filter those results; the X button closes the overlay back to the browse view.

- [ ] **Step 4: Run the full test suite and commit**

Run: `npx vitest run`
Expected: all tests pass.

```bash
git add "app/(watchlog)/watchlog/_components/DiscoverContent.tsx"
git commit -m "feat(watchlog): full-screen Discover search with sort/filter, genre and regional rows"
```

---

## Post-plan notes

- Task 9 removes `MoodChips.tsx` and `SuggestionResults.tsx` — if instructed to keep Stack/Grid as a fallback view in the future, both would need to be restored from git history rather than rebuilt from scratch.
