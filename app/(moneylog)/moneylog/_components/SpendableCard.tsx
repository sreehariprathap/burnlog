// app/(moneylog)/moneylog/_components/SpendableCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getPeriodConfig, getWeekRange } from '@/lib/moneylog/period';
import { computeSpendable } from '@/lib/moneylog/spendable';
import type { RecurringItemRow } from '@/lib/financePeriods';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function SpendableCard({ profileId, refreshKey }: { profileId: string; refreshKey: number }) {
  const supabase = createClient();
  const [biweekly, setBiweekly] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof computeSpendable> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase.from('profiles').select('moneylogWeekStart, moneylogMonthStartDay, moneylogYearStartMonth').eq('id', profileId).single();
      const config = getPeriodConfig(profile);
      const { start: weekStart, end: weekEnd } = getWeekRange(new Date(), config);

      // Biweekly pairs the current week with the previous week when the
      // week number since the Unix epoch is odd, keeping period boundaries
      // deterministic without any new per-profile config.
      const epochWeeks = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
      const periodStart = biweekly && epochWeeks % 2 === 1 ? addDays(weekStart, -7) : weekStart;
      const periodEnd = biweekly ? addDays(periodStart, 13) : weekEnd;

      const [{ data: recurringItems }, { data: transactions }, { data: bucketEntries }] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('finance_transactions').select('amount, date, type').eq('profileId', profileId).gte('date', periodStart.toISOString()).lte('date', periodEnd.toISOString()),
        supabase.from('bucket_entries').select('amount, createdAt, type, bucket:savings_buckets!inner(profileId)').eq('bucket.profileId', profileId).eq('type', 'contribution').gte('createdAt', periodStart.toISOString()).lte('createdAt', periodEnd.toISOString()),
      ]);

      setResult(
        computeSpendable({
          recurringItems: (recurringItems ?? []) as RecurringItemRow[],
          periodStart,
          periodEnd,
          loggedExpenses: (transactions ?? []).filter((t) => t.type === 'expense').map((t) => ({ amount: t.amount, date: t.date })),
          bucketContributions: (bucketEntries ?? []).map((e) => ({ amount: e.amount, createdAt: e.createdAt })),
        })
      );
    })();
  }, [supabase, profileId, biweekly, refreshKey]);

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Left to spend {biweekly ? 'this biweek' : 'this week'}</p>
          <Button variant="ghost" size="sm" onClick={() => setBiweekly((b) => !b)}>
            {biweekly ? 'Switch to weekly' : 'Switch to biweekly'}
          </Button>
        </div>
        {result && (
          <>
            <p className="text-2xl font-semibold">${result.remaining.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              ${result.spentSoFar.toFixed(2)} spent of ${result.spendable.toFixed(2)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
