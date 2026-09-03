// app/(moneylog)/moneylog/_components/NetWorthCard.tsx
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight } from 'lucide-react';
import { WalletIcon, type WalletIconHandle } from '@/components/ui/wallet';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { StatCard } from '@/components/ui/stat-card';
import { apiFetch } from '@/lib/apiFetch';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load net worth');
  return res.json();
}

export function NetWorthCard() {
  const { data } = useSWR<{ netWorth: number }>('/api/moneylog/assets', fetcher);
  const walletIconRef = useRef<WalletIconHandle>(null);
  useMountAnimation(walletIconRef);

  return (
    <Link href="/moneylog/assets">
      <StatCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WalletIcon ref={walletIconRef} size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Net Worth</p>
              <p className={cn('text-lg font-semibold tabular-nums', (data?.netWorth ?? 0) < 0 && 'text-destructive')}>
                {data ? formatCurrency(data.netWorth) : '—'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </StatCard>
    </Link>
  );
}
