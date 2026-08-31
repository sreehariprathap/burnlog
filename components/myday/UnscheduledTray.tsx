'use client';

import { Flame, ListChecks, Wallet, type LucideIcon } from 'lucide-react';
import type { MyDayUnscheduledItem } from '@/lib/myday/types';

interface UnscheduledTrayProps {
  items: MyDayUnscheduledItem[];
  onSelect: (item: MyDayUnscheduledItem) => void;
}

const SOURCE_ICON: Record<MyDayUnscheduledItem['source'], LucideIcon> = {
  burnlog: Flame,
  tasklog: ListChecks,
  moneylog: Wallet,
};

export function UnscheduledTray({ items, onSelect }: UnscheduledTrayProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {items.map((item) => {
        const Icon = SOURCE_ICON[item.source];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}
