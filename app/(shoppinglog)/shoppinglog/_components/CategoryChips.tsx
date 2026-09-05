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
        aria-pressed={selected === null}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          selected === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
        )}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.slug)}
          aria-pressed={selected === c.slug}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            selected === c.slug ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          <CategoryIcon name={c.icon} className="size-3.5" />
          {c.name}
        </button>
      ))}
    </div>
  );
}
