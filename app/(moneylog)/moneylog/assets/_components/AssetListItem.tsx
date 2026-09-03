// app/(moneylog)/moneylog/assets/_components/AssetListItem.tsx
'use client';

import Link from 'next/link';
import { Repeat } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { assetCategoryLabel } from '@/lib/moneylog/assetCategories';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AssetSummary {
  id: string;
  name: string;
  category: string;
  value: number;
  updatedAt: string | null;
  investedValue?: number | null;
  unrealizedIncome?: number | null;
  sipEnabled?: boolean;
}

interface AssetListItemProps {
  asset: AssetSummary;
  onUpdateClick: (asset: AssetSummary) => void;
}

export function AssetListItem({ asset, onUpdateClick }: AssetListItemProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <Link href={`/moneylog/assets/${asset.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium flex items-center gap-1.5">
            {asset.name}
            {asset.sipEnabled && <Repeat className="h-3 w-3 text-muted-foreground shrink-0" aria-label="SIP enrolled" />}
          </p>
          <p className="text-xs text-muted-foreground">{assetCategoryLabel(asset.category)}</p>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(asset.value)}</p>
            {asset.unrealizedIncome != null && (
              <p className={cn('text-xs tabular-nums', asset.unrealizedIncome >= 0 ? 'text-success' : 'text-destructive')}>
                {asset.unrealizedIncome >= 0 ? '+' : ''}{formatCurrency(asset.unrealizedIncome)}
              </p>
            )}
            {!asset.updatedAt && <p className="text-xs text-muted-foreground">Not yet updated</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => onUpdateClick(asset)}>
            Update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
