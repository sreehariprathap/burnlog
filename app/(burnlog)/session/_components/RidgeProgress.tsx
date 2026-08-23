'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RidgeProgressProps = {
  weeks: { weekIndex: number; complete: boolean }[];
  onSelectWeek?: (weekIndex: number) => void;
};

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 210;
const PADDING_X = 50;
const TOP_Y = 20;
const BOTTOM_Y = 175;

export function RidgeProgress({ weeks, onSelectWeek }: RidgeProgressProps) {
  const n = weeks.length;
  const completeCount = weeks.filter((w) => w.complete).length;
  const currentIndex = weeks.findIndex((w) => !w.complete);

  const peaks = weeks.map((w, i) => {
    const x = n === 1 ? VIEW_WIDTH / 2 : PADDING_X + (i * (VIEW_WIDTH - PADDING_X * 2)) / (n - 1);
    const y = n === 1 ? TOP_Y : BOTTOM_Y - (i * (BOTTOM_Y - TOP_Y)) / (n - 1);
    return { ...w, x, y };
  });

  const linePath = peaks.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Your climb</CardTitle>
        <span className="font-mono text-xs text-muted-foreground">
          {completeCount} / {n} weeks complete
        </span>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="w-full">
          <path d={linePath} fill="none" stroke="var(--border)" strokeWidth={2} />
          {peaks.map((p, i) => (
            <circle
              key={p.weekIndex}
              cx={p.x}
              cy={p.y}
              r={9}
              stroke="var(--card)"
              strokeWidth={3}
              fill={p.complete ? 'var(--primary)' : i === currentIndex ? 'var(--chart-3)' : 'var(--muted)'}
              onClick={() => onSelectWeek?.(p.weekIndex)}
              className={onSelectWeek ? 'cursor-pointer' : undefined}
            />
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
