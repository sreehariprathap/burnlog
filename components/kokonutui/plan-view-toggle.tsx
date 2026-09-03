// components/kokonutui/plan-view-toggle.tsx
'use client';

import { CalendarDays, CalendarRange, Mountain } from 'lucide-react';
import { SmoothTabs, type TabItem } from './smooth-tabs';

const PLAN_VIEW_TABS: TabItem[] = [
  { id: 'day', icon: CalendarDays, label: 'Day view', color: 'var(--chart-1)' },
  { id: 'month', icon: CalendarRange, label: 'Month view', color: 'var(--chart-2)' },
  { id: 'program', icon: Mountain, label: 'Program view', color: 'var(--chart-3)' },
];

type PlanView = 'day' | 'month' | 'program';

type PlanViewToggleProps = {
  view: PlanView;
  onChange: (view: PlanView) => void;
};

const INDEX_TO_VIEW: PlanView[] = ['day', 'month', 'program'];

export function PlanViewToggle({ view, onChange }: PlanViewToggleProps) {
  const selectedIndex = INDEX_TO_VIEW.indexOf(view);
  return (
    <SmoothTabs
      items={PLAN_VIEW_TABS}
      selectedIndex={selectedIndex}
      onSelect={(index) => onChange(INDEX_TO_VIEW[index])}
      showLabels
    />
  );
}
