// app/(sociallog)/sociallog/search/_components/TopicResults.tsx
'use client';

import useSWR from 'swr';
import { Loader2, Hash } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

type TopicResult = { name: string; postCount: number };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export function TopicResults({ query }: { query: string }) {
  const { data, isLoading } = useSWR<{ results: TopicResult[] }>(
    `/api/sociallog/search/topics?q=${encodeURIComponent(query)}`,
    fetcher
  );

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if ((data?.results.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Hash className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No topics found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data!.results.map((t) => (
        <div key={t.name} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t.postCount} post{t.postCount === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  );
}
