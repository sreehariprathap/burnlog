// components/logbook/DayScoreRing.tsx
import { StatRing } from '@/components/ui/stat-ring';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';

interface DayScoreRingProps {
  score: number | null;
  mode: LifeScoreMode;
  onModeChange: (mode: LifeScoreMode) => void;
}

const MODES: { id: LifeScoreMode; label: string }[] = [
  { id: 'engagement', label: 'Today' },
  { id: 'streak', label: 'Streak' },
  { id: 'goal', label: 'Goal' },
];

function scoreLabel(score: number): string {
  if (score >= 85) return 'Crushing it';
  if (score >= 60) return 'On track';
  if (score >= 30) return 'Getting started';
  return 'Just beginning';
}

export function DayScoreRing({ score, mode, onModeChange }: DayScoreRingProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <StatRing value={score ?? 0} size="lg" className="text-4xl" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Day Score</span>
      <p className="text-sm font-medium text-muted-foreground">
        {score === null ? 'Log something to get your score' : scoreLabel(score)}
      </p>
      <div className="mt-1 flex gap-1 rounded-full border border-white/10 bg-background/40 p-1">
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onModeChange(m.id)}
            className={cn(
              'h-7 rounded-full px-3 text-xs',
              mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {m.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
