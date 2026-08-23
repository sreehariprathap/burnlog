// components/kokonutui/weekday-tabs.tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// Values are the canonical dayOfWeek convention used everywhere else in the
// app (0=Sun...6=Sat). This array only controls *display order* (Mon first).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

type WeekdayTabsProps = {
  value: number;
  onChange: (day: number) => void;
};

export function WeekdayTabs({ value, onChange }: WeekdayTabsProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex w-full justify-around gap-1 px-4 py-2">
      {DISPLAY_ORDER.map((dayOfWeek) => {
        const isActive = dayOfWeek === value;
        const isHovered = hovered === dayOfWeek;
        return (
          <button
            key={dayOfWeek}
            type="button"
            onClick={() => onChange(dayOfWeek)}
            onMouseEnter={() => setHovered(dayOfWeek)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex-1 rounded-lg py-1.5 text-center text-sm font-medium"
          >
            {isActive && (
              <motion.span
                layoutId="weekday-tabs-active"
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {!isActive && isHovered && <span className="absolute inset-0 rounded-lg bg-muted" />}
            <span
              className={cn(
                'relative z-10',
                isActive ? 'text-primary-foreground' : 'text-foreground dark:text-gray-200'
              )}
            >
              {LABELS[dayOfWeek]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
