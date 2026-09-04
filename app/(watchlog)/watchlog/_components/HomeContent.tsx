// app/(watchlog)/watchlog/_components/HomeContent.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { watchItemsQuery } from '@/lib/watchlog/queries';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import { MoodChips } from './MoodChips';
import { SuggestionResults } from './SuggestionResults';
import type { TmdbItem } from '@/lib/watchlog/types';

interface SuggestResponse {
  rationale: string;
  results: TmdbItem[];
}

async function fetchSuggestions(moods: string[], freeText: string | null, likedGenres: string[]): Promise<SuggestResponse> {
  const res = await fetch('/api/ai/watchlog/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moods, freeText, likedGenres }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? 'Suggestion request failed');
  }
  return res.json();
}

interface CachedSuggestion {
  request: { moods?: string[]; freeText?: string | null } | null;
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

  const completedQuery = profile ? watchItemsQuery(profile.id, 'completed') : null;
  const { data: completed } = useSWR(completedQuery?.key ?? null, completedQuery?.fetcher ?? null);
  const likedGenres = Array.from(
    new Set((completed ?? []).filter((i) => (i.rating ?? 0) >= 4).flatMap((i) => i.genres))
  );

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [restoringSuggestion, setRestoringSuggestion] = useState(true);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function toggleMood(id: string) {
    setSelectedMoods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function handleSuggest(moods: string[] = selectedMoods, text: string = freeText) {
    setLoadingSuggestion(true);
    setSuggestError(null);
    try {
      const result = await fetchSuggestions(moods, text || null, likedGenres);
      setSuggestion(result);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoadingSuggestion(false);
    }
  }

  // Never start empty: on first load, restore the last generated
  // suggestion (and the mood config that produced it) from ai_jobs; if
  // this profile has never generated one, fetch a mood-less "surprise me"
  // suggestion automatically instead of showing a blank picker.
  const initializedForProfile = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || initializedForProfile.current === profile.id) return;
    initializedForProfile.current = profile.id;
    (async () => {
      try {
        const cached = await fetchCachedSuggestion();
        if (cached?.response) {
          setSelectedMoods(cached.request?.moods ?? []);
          setFreeText(cached.request?.freeText ?? '');
          setSuggestion(cached.response);
        } else {
          await handleSuggest([], '');
        }
      } finally {
        setRestoringSuggestion(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function removeFromSuggestions(item: TmdbItem) {
    setSuggestion((prev) =>
      prev ? { ...prev, results: prev.results.filter((r) => r.tmdbId !== item.tmdbId || r.mediaType !== item.mediaType) } : prev
    );
  }

  async function handleAdd(item: TmdbItem, status: 'want' | 'completed' = 'want') {
    const res = await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status }),
    });
    if (res.ok) {
      toast({ description: status === 'completed' ? `Marked "${item.title}" as watched` : `Added "${item.title}" to your watchlist` });
      removeFromSuggestions(item);
    }
  }

  async function handleIgnore(item: TmdbItem) {
    await fetch('/api/watchlog/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: item.tmdbId, mediaType: item.mediaType }),
    });
    removeFromSuggestions(item);
  }

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
          <p className="text-sm font-medium">What are you in the mood for?</p>
          <MoodChips selected={selectedMoods} onToggle={toggleMood} />
          <Textarea
            placeholder="Anything else? (optional)"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
          />
          <Button onClick={() => handleSuggest()} disabled={loadingSuggestion || selectedMoods.length === 0}>
            {loadingSuggestion ? 'Thinking...' : 'Suggest something'}
          </Button>

          {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}

          {restoringSuggestion || (loadingSuggestion && !suggestion) ? (
            <Skeleton className="h-[320px] w-full rounded-xl" />
          ) : (
            suggestion && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{suggestion.rationale}</p>
                <SuggestionResults
                  items={suggestion.results}
                  onAdd={(item) => handleAdd(item)}
                  onMarkWatched={(item) => handleAdd(item, 'completed')}
                  onIgnore={handleIgnore}
                />
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
