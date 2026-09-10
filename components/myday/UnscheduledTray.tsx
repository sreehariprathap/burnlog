'use client';

import { Wallet } from 'lucide-react';
import type { MyDayUnscheduledItem } from '@/lib/myday/types';

interface UnscheduledTrayProps {
  items: MyDayUnscheduledItem[];
  onSelect: (item: MyDayUnscheduledItem) => void;
}

export function UnscheduledTray({ items, onSelect }: UnscheduledTrayProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Plan my day</p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
