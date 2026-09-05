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
import { MOVIE_GENRES, TV_GENRES } from '@/lib/watchlog/discoverRows';
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
  const [suggestionError, setSuggestionError] = useState(false);

  async function regenerate(genres: string[], text: string) {
    setLoadingSuggestion(true);
    setSuggestionError(false);
    try {
      const result = await fetchSuggestions(genres, text || null);
      setSuggestion(result);
      setDeckIndex(0);
    } catch (err) {
      setSuggestionError(true);
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
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
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

  function skipCurrent(item: TmdbItem) {
    handleIgnore(item);
    setDeckIndex((i) => i + 1);
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
          ) : suggestionError && results.length === 0 ? (
            <div className="flex h-[480px] w-full max-w-sm mx-auto flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Couldn&apos;t load suggestions</p>
              <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
              <Button size="sm" variant="outline" onClick={() => regenerate(Array.from(selectedGenres), freeText)}>
                Retry
              </Button>
            </div>
          ) : (
            <Deck className="h-[480px] w-full max-w-sm mx-auto">
              <DeckEmpty>
                <p className="text-sm">That&apos;s everything — tap the orb for more.</p>
              </DeckEmpty>
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
                      aria-label={`View details for ${item.title}`}
                      className="relative h-3/4 w-full overflow-hidden bg-muted transition-transform active:scale-[0.98]"
                    >
                      {item.posterPath ? (
                        <Image
                          src={`${TMDB_IMG_BASE}${item.posterPath}`}
                          alt={item.title}
                          fill
                          sizes="(max-width: 640px) 90vw, 384px"
                          className="object-cover"
                        />
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
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 active:scale-[0.97]" onClick={() => skipCurrent(item)}>
                          Not Interested
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1 active:scale-[0.97]" onClick={() => handleAdd(item, 'completed')}>
                          Mark Watched
                        </Button>
                      </div>
                    </div>
                  </DeckItem>
                ))}
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
                  aria-pressed={selectedGenres.has(genre)}
                  onClick={() => toggleGenre(genre)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
              aria-label="Anything else you want to add"
              placeholder="Anything else? (optional)"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <Button onClick={handleOrbSubmit} disabled={loadingSuggestion} className="w-full active:scale-[0.98]">
              {loadingSuggestion ? 'Thinking…' : 'Regenerate'}
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
