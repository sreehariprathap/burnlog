// components/onboarding/OnboardingProgressBar.tsx
'use client';

import { Progress, ProgressIndicator } from '@/components/ui/progress';

interface OnboardingProgressBarProps {
  /** 1-based position in the overall onboarding flow. */
  current: number;
  total: number;
  /** This step's app color — the fill gradient is built from it. */
  color: string;
}

/** Fixed-to-bottom progress bar shown throughout onboarding, so the user
 * always has a sense of how much is left. The gradient fill is tinted with
 * whichever app the current step belongs to (Logbook's color for the
 * shared pre-steps — profile, AI insights, app picker). */
export function OnboardingProgressBar({ current, total, color }: OnboardingProgressBarProps) {
  const value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const isLast = current >= total;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-background/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-md flex-col gap-1.5">
        <p className="text-center text-xs text-muted-foreground">
          {isLast ? "Almost there!" : `Step ${current} of ${total}`}
        </p>
        <Progress value={value} className="bg-muted">
          <ProgressIndicator
            className="animate-progress-shimmer h-full w-full flex-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, color-mix(in oklch, ${color} 55%, white) 0%, ${color} 50%, color-mix(in oklch, ${color} 55%, white) 100%)`,
              backgroundSize: '200% 100%',
            }}
          />
        </Progress>
      </div>
    </div>
  );
}
