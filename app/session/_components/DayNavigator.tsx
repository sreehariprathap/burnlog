// components/DayNavigator.tsx
'use client';
import React from 'react';

const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type DayNavigatorProps = {
  value: number;
  onChange: (day: number) => void;
};

export function DayNavigator({ value, onChange }: DayNavigatorProps) {
  return (
    <div className="flex justify-around bg-white py-2 shadow-sm sticky top-0 z-20 gap-3 px-4">
      {days.map((dayLabel, idx) => (
        <button
          key={dayLabel}
          className={`flex-1 text-center py-1 ${
            idx === value ? 'bg-blue-500 text-white rounded' : 'text-gray-600'
          }`}
          onClick={() => onChange(idx)}
        >
          {dayLabel}
        </button>
      ))}
    </div>
  );
}

