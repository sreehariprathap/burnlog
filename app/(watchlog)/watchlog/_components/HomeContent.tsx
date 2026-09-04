// app/(watchlog)/watchlog/_components/HomeContent.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { watchItemsQuery } from '@/lib/watchlog/queries';
import { WatchItemCard } from '@/components/watchlog/WatchItemCard';
import { MoodChips } from './MoodChips';
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

export function HomeContent() {
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
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function toggleMood(id: string) {
    setSelectedMoods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function handleSuggest() {
    setLoadingSuggestion(true);
    setSuggestError(null);
    try {
      const result = await fetchSuggestions(selectedMoods, freeText || null, likedGenres);
      setSuggestion(result);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function handleAdd(item: TmdbItem) {
    await fetch('/api/watchlog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
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
          <Button onClick={handleSuggest} disabled={loadingSuggestion || selectedMoods.length === 0}>
            {loadingSuggestion ? 'Thinking...' : 'Suggest something'}
          </Button>

          {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}

          {suggestion && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{suggestion.rationale}</p>
              <div className="grid grid-cols-2 gap-3">
                {suggestion.results.map((item) => (
                  <WatchItemCard
                    key={`${item.mediaType}-${item.tmdbId}`}
                    item={item}
                    badge="Add"
                    onClick={() => handleAdd(item)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
