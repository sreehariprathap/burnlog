// app/(shoppinglog)/shoppinglog/_components/CategoryChips.tsx
'use client';

import { cn } from '@/lib/utils';
import { CategoryIcon } from './CategoryIcon';

export type Category = { id: string; name: string; slug: string; icon: string };

export function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          selected === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
        )}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.slug)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            selected === c.slug ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
          )}
        >
          <CategoryIcon name={c.icon} className="size-3.5" />
          {c.name}
        </button>
      ))}
    </div>
  );
}
