// components/logbook/CorrelationInsight.tsx
'use client';

import useSWR from 'swr';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LogbookCorrelation } from '@/lib/logbook/correlation';

async function fetchCorrelation(): Promise<LogbookCorrelation> {
  const res = await fetch('/api/logbook/correlation');
  if (!res.ok) throw new Error('Failed to load insight');
  return res.json();
}

export function CorrelationInsight() {
  const { data, isLoading, error } = useSWR('logbook-correlation', fetchCorrelation);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.available || !data.headline) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{data.headline}</p>
          {data.detail && <p className="mt-0.5 text-xs text-muted-foreground">{data.detail}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
