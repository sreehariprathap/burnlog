// components/kokonutui/plan-view-toggle.tsx
'use client';

import { CalendarDays, CalendarRange } from 'lucide-react';
import { SmoothTabs, type TabItem } from './smooth-tabs';

const PLAN_VIEW_TABS: TabItem[] = [
  { id: 'day', icon: CalendarDays, label: 'Day view', color: 'var(--chart-1)' },
  { id: 'month', icon: CalendarRange, label: 'Month view', color: 'var(--chart-2)' },
];

type PlanViewToggleProps = {
  view: 'day' | 'month';
  onChange: (view: 'day' | 'month') => void;
};

export function PlanViewToggle({ view, onChange }: PlanViewToggleProps) {
  const selectedIndex = view === 'day' ? 0 : 1;
  return (
    <SmoothTabs
      items={PLAN_VIEW_TABS}
      selectedIndex={selectedIndex}
      onSelect={(index) => onChange(index === 0 ? 'day' : 'month')}
    />
  );
}
