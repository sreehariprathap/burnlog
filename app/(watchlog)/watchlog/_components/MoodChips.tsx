// app/(watchlog)/watchlog/_components/MoodChips.tsx
'use client';

import { cn } from '@/lib/utils';
import { MOOD_CHIPS } from '@/lib/watchlog/suggestions';

interface MoodChipsProps {
  selected: string[];
  onToggle: (id: string) => void;
}

export function MoodChips({ selected, onToggle }: MoodChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MOOD_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onToggle(chip.id)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition-colors',
            selected.includes(chip.id)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-foreground border-border'
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
