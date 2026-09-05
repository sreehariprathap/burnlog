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
import { MOVIE_GENRES, TV_GENRES } from '@/lib/watchlog/discoverRows';
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
          aria-pressed={selected.has(option)}
          onClick={() => onToggle(option)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
      if (next.has(genre)) {
        next.delete(genre);
      } else {
        next.add(genre);
      }
      return next;
    });
  }

  function toggleType(id: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

        <Button onClick={handleContinue} disabled={saving} className="active:scale-[0.98]">
          {saving ? 'Setting up…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
