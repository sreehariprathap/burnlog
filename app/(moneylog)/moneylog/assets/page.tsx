// app/(moneylog)/moneylog/assets/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/apiFetch';
import { NetWorthSummaryCard } from './_components/NetWorthSummaryCard';
import { AssetListItem, type AssetSummary } from './_components/AssetListItem';
import { AddAssetDrawer } from './_components/AddAssetDrawer';
import { UpdateBalanceDrawer } from './_components/UpdateBalanceDrawer';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load assets');
  return res.json();
}

export default function AssetsPage() {
  const { data, isLoading, mutate } = useSWR<{ assets: AssetSummary[]; netWorth: number }>(
    '/api/moneylog/assets',
    fetcher
  );
  const [addOpen, setAddOpen] = useState(false);
  const [updating, setUpdating] = useState<AssetSummary | null>(null);

  const assets = data?.assets ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Assets" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-32">
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (
          <>
            <NetWorthSummaryCard netWorth={data?.netWorth ?? 0} assetCount={assets.length} />
            <div className="space-y-2">
              {assets.map((asset) => (
                <AssetListItem key={asset.id} asset={asset} onUpdateClick={setUpdating} />
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Asset
            </Button>
          </>
        )}
      </main>
      <AddAssetDrawer open={addOpen} onOpenChange={setAddOpen} onCreated={() => mutate()} />
      <UpdateBalanceDrawer asset={updating} onOpenChange={(open) => !open && setUpdating(null)} onUpdated={() => mutate()} />
      <MoneyLogBottomNav />
    </div>
  );
}
