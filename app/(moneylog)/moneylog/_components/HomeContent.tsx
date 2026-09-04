'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { CalendarDays, CalendarRange, Calendar, RefreshCw } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/TopBar';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { DualRingCard } from '@/components/kokonutui/dual-ring-card';
import { StatCard } from '@/components/ui/stat-card';
import { type RingSegment } from '@/components/kokonutui/segmented-ring-card';
import { useFinanceData } from '@/lib/useFinanceData';
import { categoryLabel } from '@/lib/financeCategories';
import { getPeriodRange, formatPeriodLabel, type Period } from '@/lib/financePeriods';
import { GetStartedCard } from './GetStartedCard';
import { NetSummaryCard } from './NetSummaryCard';
import { NetWorthCard } from './NetWorthCard';
import { MoneyLogFab } from './MoneyLogFab';

const periodTabs: TabItem[] = [
  { id: 'weekly', icon: CalendarDays, label: 'Weekly', color: 'var(--chart-1)' },
  { id: 'monthly', icon: CalendarRange, label: 'Monthly', color: 'var(--chart-2)' },
  { id: 'yearly', icon: Calendar, label: 'Yearly', color: 'var(--chart-3)' },
];

const PERIODS: Period[] = ['weekly', 'monthly', 'yearly'];

const INCOME_RING_COLORS = [
  'var(--moneylog-income-1)', 'var(--moneylog-income-2)', 'var(--moneylog-income-3)',
  'var(--moneylog-income-4)', 'var(--moneylog-income-5)', 'var(--moneylog-income-6)',
];
const EXPENSE_RING_COLORS = [
  'var(--moneylog-expense-1)', 'var(--moneylog-expense-2)', 'var(--moneylog-expense-3)',
  'var(--moneylog-expense-4)', 'var(--moneylog-expense-5)', 'var(--moneylog-expense-6)',
];

function toSegments(byCategory: Record<string, number>, palette: string[]): RingSegment[] {
  return Object.entries(byCategory).map(([category, value], index) => ({
    category,
    label: categoryLabel(category),
    value,
    color: palette[index % palette.length],
  }));
}

function PeriodSlide({
  profileId,
  period,
  hasAnyData,
  refreshKey,
}: {
  profileId: string | null;
  period: Period;
  hasAnyData: boolean;
  refreshKey: number;
}) {
  const data = useFinanceData(profileId, period, refreshKey);
  const periodLabel = formatPeriodLabel(period, getPeriodRange(period));

  if (data.loading) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <Skeleton className="h-40 w-40 rounded-full" />
            <div className="w-full grid grid-cols-2 gap-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 grid grid-cols-3 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasAnyData && <GetStartedCard />}
      <StatCard>
        <DualRingCard
          subtitle={periodLabel}
          incomeSegments={toSegments(data.incomeByCategory, INCOME_RING_COLORS)}
          incomeTotal={data.totalIncome}
          expenseSegments={toSegments(data.expenseByCategory, EXPENSE_RING_COLORS)}
          expenseTotal={data.totalExpense}
        />
      </StatCard>
      <NetSummaryCard income={data.totalIncome} expense={data.totalExpense} />
      <NetWorthCard />
    </div>
  );
}

export function HomeContent() {
  const supabase = createClient();
  const { profile } = useCurrentProfile();
  const profileId = profile?.id ?? null;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const { data: hasAnyData, mutate: refreshHasAnyData } = useSWR(
    profileId ? ['moneylog-has-any-data', profileId] : null,
    async () => {
      const [{ count: recurringCount }, { count: transactionCount }] = await Promise.all([
        supabase.from('recurring_items').select('id', { count: 'exact', head: true }).eq('profileId', profileId!),
        supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('profileId', profileId!),
      ]);
      return (recurringCount || 0) + (transactionCount || 0) > 0;
    },
    { fallbackData: true }
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setRefreshKey((k) => k + 1);
      await refreshHasAnyData();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="pb-24">
      <TopBar
        title="MoneyLog"
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={periodTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
      </div>
      <div className="px-4 py-2">
        <MotionCarousel
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          slides={PERIODS.map((period) => (
            <PeriodSlide key={period} profileId={profileId} period={period} hasAnyData={hasAnyData ?? true} refreshKey={refreshKey} />
          ))}
        />
      </div>
      {profileId && (
        <MoneyLogFab
          profileId={profileId}
          onLogged={() => {
            setRefreshKey((k) => k + 1);
            refreshHasAnyData();
          }}
        />
      )}
    </div>
  );
}
