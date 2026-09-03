// app/(intellog)/intellog/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { CheckIcon, XIcon, ClockIcon, SparklesIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';

type SuggestionRow = {
  id: string;
  app: string;
  kind: string;
  title: string;
  body: string;
  deepLink: string;
  status: 'new' | 'acted' | 'dismissed' | 'snoozed';
  createdAt: string;
};

function SuggestionCard({
  suggestion,
  onAct,
  onDismiss,
  onSnooze,
}: {
  suggestion: SuggestionRow;
  onAct: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SparklesIcon className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{suggestion.app}</span>
        </div>
        <p className="text-sm font-semibold">{suggestion.title}</p>
        <p className="text-sm text-muted-foreground">{suggestion.body}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" onClick={onAct}>
            <CheckIcon className="mr-1 h-3 w-3" aria-hidden="true" />
            Act
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onSnooze}>
            <ClockIcon className="mr-1 h-3 w-3" aria-hidden="true" />
            Snooze
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            <XIcon className="mr-1 h-3 w-3" aria-hidden="true" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntelLogPage() {
  const supabase = createClient();
  const router = useRouter();
  const { profile } = useCurrentProfile();

  const { data, mutate } = useSWR(profile ? ['intellog-suggestions', profile.id] : null, async () => {
    const { data } = await supabase
      .from('intel_suggestions')
      .select('*')
      .eq('profileId', profile!.id)
      .in('status', ['new', 'snoozed'])
      .order('createdAt', { ascending: false });
    return (data as SuggestionRow[]) || [];
  });

  const suggestions = data ?? [];
  const newSuggestions = suggestions.filter((s) => s.status === 'new');
  const snoozed = suggestions.filter((s) => s.status === 'snoozed');

  async function respond(id: string, status: 'acted' | 'dismissed' | 'snoozed') {
    await supabase.from('intel_suggestions').update({ status, respondedAt: new Date().toISOString() }).eq('id', id);
    await mutate();
  }

  async function handleAct(suggestion: SuggestionRow) {
    await respond(suggestion.id, 'acted');
    router.push(suggestion.deepLink);
  }

  return (
    <div className="pb-24">
      <TopBar title="IntelLog" />
      <div className="flex flex-col gap-4 px-4 py-4">
        {!data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">New</p>
              {newSuggestions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                  <SparklesIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-semibold">No suggestions yet</p>
                  <p className="text-xs text-muted-foreground">
                    Keep using your other apps — IntelLog needs at least a week of activity to start suggesting.
                  </p>
                </div>
              ) : (
                newSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onAct={() => handleAct(s)}
                    onDismiss={() => respond(s.id, 'dismissed')}
                    onSnooze={() => respond(s.id, 'snoozed')}
                  />
                ))
              )}
            </div>
            {snoozed.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">Snoozed</p>
                {snoozed.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onAct={() => handleAct(s)}
                    onDismiss={() => respond(s.id, 'dismissed')}
                    onSnooze={() => respond(s.id, 'snoozed')}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
