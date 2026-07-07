// components/DayNavigator.tsx
'use client';
import React from 'react';

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

type DayNavigatorProps = {
  value: number;
  onChange: (day: number) => void;
};

export function DayNavigator({ value, onChange }: DayNavigatorProps) {
  return (
    <div className="flex justify-around py-2 shadow-sm sticky top-0 z-20 gap-3 px-4 w-full">
      {DISPLAY_ORDER.map((dayOfWeek) => (
        <button
          key={dayOfWeek}
          className={`flex-1 text-center py-1 ${
            dayOfWeek === value ? 'bg-amber-500 text-white rounded' : 'dark:text-gray-200'
          }`}
          onClick={() => onChange(dayOfWeek)}
        >
          {LABELS[dayOfWeek]}
        </button>
      ))}
    </div>
  );
}
