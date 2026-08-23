// app/(lifelog)/lifelog/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { DualRingCard } from '@/components/kokonutui/dual-ring-card';
import { type RingSegment } from '@/components/kokonutui/segmented-ring-card';
import { useFinanceData } from '@/lib/useFinanceData';
import { categoryLabel } from '@/lib/financeCategories';
import { getPeriodRange, formatPeriodLabel, type Period } from '@/lib/financePeriods';
import { GetStartedCard } from './_components/GetStartedCard';
import { NetSummaryCard } from './_components/NetSummaryCard';
import { LifeLogFab } from './_components/LifeLogFab';

const periodTabs: TabItem[] = [
  { id: 'weekly', icon: CalendarDays, label: 'Weekly', color: 'var(--chart-1)' },
  { id: 'monthly', icon: CalendarRange, label: 'Monthly', color: 'var(--chart-2)' },
  { id: 'yearly', icon: Calendar, label: 'Yearly', color: 'var(--chart-3)' },
];

const PERIODS: Period[] = ['weekly', 'monthly', 'yearly'];

const INCOME_RING_COLORS = ['#10B981', '#14B8A6', '#22C55E', '#059669', '#0D9488', '#65A30D'];
const EXPENSE_RING_COLORS = ['#F43F5E', '#F97316', '#EF4444', '#EC4899', '#F59E0B', '#DC2626'];

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

  return (
    <div className="flex flex-col gap-4">
      {!hasAnyData && !data.loading && <GetStartedCard />}
      <Card>
        <CardContent className="pt-6">
          <DualRingCard
            subtitle={periodLabel}
            incomeSegments={toSegments(data.incomeByCategory, INCOME_RING_COLORS)}
            incomeTotal={data.totalIncome}
            expenseSegments={toSegments(data.expenseByCategory, EXPENSE_RING_COLORS)}
            expenseTotal={data.totalExpense}
          />
        </CardContent>
      </Card>
      <NetSummaryCard income={data.totalIncome} expense={data.totalExpense} />
    </div>
  );
}

export default function LifeLogHomePage() {
  const supabase = createClientComponentClient();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasAnyData, setHasAnyData] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = async (id: string) => {
    const [{ count: recurringCount }, { count: transactionCount }] = await Promise.all([
      supabase.from('recurring_items').select('id', { count: 'exact', head: true }).eq('profileId', id),
      supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('profileId', id),
    ]);
    setHasAnyData((recurringCount || 0) + (transactionCount || 0) > 0);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
      if (!profile) return;
      setProfileId(profile.id);
      await refreshData(profile.id);
    })();
  }, [supabase]);

  return (
    <div className="pb-24">
      <TopBar title="LifeLog" />
      <div className="sticky top-14 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={periodTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
      </div>
      <div className="px-4 py-2">
        <MotionCarousel
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          slides={PERIODS.map((period) => (
            <PeriodSlide key={period} profileId={profileId} period={period} hasAnyData={hasAnyData} refreshKey={refreshKey} />
          ))}
        />
      </div>
      {profileId && (
        <LifeLogFab
          profileId={profileId}
          onLogged={() => {
            setRefreshKey((k) => k + 1);
            refreshData(profileId);
          }}
        />
      )}
      <LifeLogBottomNav />
    </div>
  );
}
