// components/logbook/StreakBadge.tsx
import { Flame } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { appSearchColor } from '@/lib/search/registry';

interface StreakBadgeProps {
  streak: number;
  streakApps: string[];
}

export function StreakBadge({ streak, streakApps }: StreakBadgeProps) {
  if (streakApps.length === 0) {
    return null;
  }

  return (
    <StatCard>
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklch, ${appSearchColor('burnlog')}, transparent 90%)` }}
        >
          <Flame
            className="h-5 w-5"
            style={{ color: streak > 0 ? appSearchColor('burnlog') : 'var(--muted-foreground)' }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {streak > 0 ? `${streak}-day unified streak` : 'No active streak'}
          </p>
          <p className="text-xs text-muted-foreground">
            Logged across {streakApps.length} app{streakApps.length === 1 ? '' : 's'} every day
          </p>
        </div>
      </div>
    </StatCard>
  );
}
