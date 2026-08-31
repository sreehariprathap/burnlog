// components/logbook/MorningBrief.tsx
'use client';

import { useEffect, useState } from 'react';
import { X, Sunrise } from 'lucide-react';
import { nsGet, nsSet } from '@/lib/appMode';

const DISMISS_KEY = 'morningBriefDismissedDate';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface MorningBriefProps {
  yesterdayScore: number | null;
  insight: string;
  burnTarget: number;
  taskTarget: number;
  budgetTarget: number;
}

export function MorningBrief({ yesterdayScore, insight, burnTarget, taskTarget, budgetTarget }: MorningBriefProps) {
  const [dismissed, setDismissed] = useState(true);
  const [isBeforeNoon, setIsBeforeNoon] = useState(false);

  useEffect(() => {
    setIsBeforeNoon(new Date().getHours() < 12);
    setDismissed(nsGet('logbook', DISMISS_KEY) === todayKey());
  }, []);

  function handleDismiss() {
    nsSet('logbook', DISMISS_KEY, todayKey());
    setDismissed(true);
  }

  if (dismissed || !isBeforeNoon) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss morning brief"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Sunrise className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">Morning brief</p>
          <p className="text-sm text-muted-foreground">
            {yesterdayScore !== null
              ? `Yesterday's day score was ${yesterdayScore}. `
              : "No day score for yesterday yet. "}
            {insight}
          </p>
          <p className="text-xs text-muted-foreground">
            Today&apos;s targets: {burnTarget.toLocaleString()} kcal burned
            {taskTarget > 0 ? `, ${taskTarget} task${taskTarget === 1 ? '' : 's'}` : ''}
            {budgetTarget > 0 ? `, ₹${Math.round(budgetTarget).toLocaleString()} budget` : ''}.
          </p>
        </div>
      </div>
    </div>
  );
}
