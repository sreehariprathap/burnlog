// app/(lifelog)/lifelog/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { SegmentedRingCard, type RingSegment } from '@/components/kokonutui/segmented-ring-card';
import { useFinanceData } from '@/lib/useFinanceData';
import { categoryLabel } from '@/lib/financeCategories';
import type { Period } from '@/lib/financePeriods';
import { GetStartedCard } from './_components/GetStartedCard';
import { NetSummaryCard } from './_components/NetSummaryCard';
import { LifeLogFab } from './_components/LifeLogFab';

const periodTabs: TabItem[] = [
  { id: 'weekly', icon: CalendarDays, label: 'Weekly', color: 'var(--chart-1)' },
  { id: 'monthly', icon: CalendarRange, label: 'Monthly', color: 'var(--chart-2)' },
  { id: 'yearly', icon: Calendar, label: 'Yearly', color: 'var(--chart-3)' },
];

const PERIODS: Period[] = ['weekly', 'monthly', 'yearly'];

const RING_COLORS = ['#14B8A6', '#0EA5E9', '#6366F1', '#F59E0B', '#EC4899', '#84CC16', '#F43F5E', '#8B5CF6', '#22C55E', '#EAB308'];

function toSegments(byCategory: Record<string, number>): RingSegment[] {
  return Object.entries(byCategory).map(([category, value], index) => ({
    category,
    label: categoryLabel(category),
    value,
    color: RING_COLORS[index % RING_COLORS.length],
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

  return (
    <div className="flex flex-col gap-4">
      {!hasAnyData && !data.loading && <GetStartedCard />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SegmentedRingCard title="Income" segments={toSegments(data.incomeByCategory)} total={data.totalIncome} />
        <SegmentedRingCard title="Expenses" segments={toSegments(data.expenseByCategory)} total={data.totalExpense} />
      </div>
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
