// app/(moneylog)/moneylog/assets/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { Loader2, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';

const AssetValueChart = dynamic(
  () => import('./_components/AssetValueChart').then((mod) => mod.AssetValueChart),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-muted" /> }
);

type Entry = { id: string; value: number; date: string; notes: string | null };

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load history');
  return res.json();
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading } = useSWR<{ entries: Entry[] }>(
    `/api/moneylog/assets/${params.id}/entries`,
    fetcher
  );

  const entries = data?.entries ?? [];
  const chartData = entries.map((e) => ({ date: format(new Date(e.date), 'MMM d'), value: e.value }));

  const archive = async () => {
    if (!window.confirm('Archive this asset? Its history is kept but it will leave your asset list.')) return;
    const res = await apiFetch(`/api/moneylog/assets/${params.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: 'Asset archived' });
      router.push('/moneylog/assets');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Asset History"
        actions={
          <Button variant="ghost" size="icon" aria-label="Archive asset" onClick={archive}>
            <Archive className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-8">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No balance history yet.</p>
        )}
        {!isLoading && entries.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Value Over Time</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <AssetValueChart data={chartData} />
              </CardContent>
            </Card>
            <div className="space-y-2">
              {[...entries].reverse().map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(entry.date), 'MMM d, yyyy')}</p>
                      {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(entry.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
