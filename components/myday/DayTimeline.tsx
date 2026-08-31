'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyDayBlock } from '@/lib/myday/types';

interface DayTimelineProps {
  blocks: MyDayBlock[];
  onBlockClick: (block: MyDayBlock) => void;
  onSlotClick: (startTime: string) => void;
}

const START_HOUR = 5;
const END_HOUR = 23;
const ROW_HEIGHT_PX = 64;

const SOURCE_COLORS: Record<MyDayBlock['source'], string> = {
  manual: '#64748B',
  burnlog: '#F97316',
  tasklog: '#3B82F6',
  moneylog: '#22C55E',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export function DayTimeline({ blocks, onBlockClick, onSlotClick }: DayTimelineProps) {
  const gridStartMinutes = START_HOUR * 60;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="relative">
      {hours.map((hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onSlotClick(`${String(hour).padStart(2, '0')}:00`)}
          className="flex w-full items-start gap-3 border-t text-left"
          style={{ height: ROW_HEIGHT_PX }}
        >
          <span className="w-12 shrink-0 pt-1 text-xs text-muted-foreground">{formatHourLabel(hour)}</span>
        </button>
      ))}

      <div className="pointer-events-none absolute inset-0 left-14">
        {blocks.map((block) => {
          const top = ((timeToMinutes(block.startTime) - gridStartMinutes) / 60) * ROW_HEIGHT_PX;
          const height = Math.max(
            24,
            ((timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60) * ROW_HEIGHT_PX
          );
          const color = SOURCE_COLORS[block.source];

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onBlockClick(block)}
              className="pointer-events-auto absolute left-0 right-2 rounded-md border-l-4 bg-card p-2 text-left shadow-sm"
              style={{ top, height, borderLeftColor: color }}
            >
              <div className="flex items-center gap-1.5">
                {block.actual !== null &&
                  (block.actual ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  ))}
                <p className={cn('truncate text-xs font-medium', block.completed && 'text-muted-foreground line-through')}>
                  {block.title}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {block.startTime}–{block.endTime}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
