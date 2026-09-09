'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';
import type { MyDayHabitOccurrence } from '@/lib/myday/types';
import type { AppId } from '@/lib/appMode';

interface HabitsChecklistProps {
  habits: MyDayHabitOccurrence[];
  onToggle: (habit: MyDayHabitOccurrence, completed: boolean) => void;
}

export function HabitsChecklist({ habits, onToggle }: HabitsChecklistProps) {
  const { colorFor } = useAppThemeColors();
  if (habits.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {habits.map((habit) => {
        const color = colorFor((habit.sourceApp as AppId | null) ?? 'logbook');
        return (
          <button
            key={habit.id}
            type="button"
            onClick={() => onToggle(habit, !habit.completed)}
            className="flex items-center gap-2 rounded-lg border bg-background p-3 text-left text-sm"
            style={{ borderLeftColor: color, borderLeftWidth: 4 }}
          >
            {habit.completed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className={habit.completed ? 'text-muted-foreground line-through' : ''}>{habit.title}</span>
          </button>
        );
      })}
    </div>
  );
}
