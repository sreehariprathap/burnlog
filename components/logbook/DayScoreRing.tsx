// components/logbook/DayScoreRing.tsx
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';

interface DayScoreRingProps {
  score: number | null;
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Crushing it';
  if (score >= 60) return 'On track';
  if (score >= 30) return 'Getting started';
  return 'Just beginning';
}

export function DayScoreRing({ score }: DayScoreRingProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <AnimatedCircularProgressBar
        value={score ?? 0}
        min={0}
        max={100}
        gaugePrimaryColor="var(--primary)"
        gaugeSecondaryColor="color-mix(in oklch, var(--primary) 15%, transparent)"
        className="size-44 text-4xl"
      />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Score</span>
      <p className="text-sm font-medium text-muted-foreground">
        {score === null ? 'Log something to get your score' : scoreLabel(score)}
      </p>
    </div>
  );
}
