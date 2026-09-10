'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyDayBlock } from '@/lib/myday/types';
import { useAppThemeColors } from '@/lib/theme/useAppThemeColors';

interface DayTimelineProps {
  blocks: MyDayBlock[];
  onBlockClick: (block: MyDayBlock) => void;
  onSlotClick: (startTime: string) => void;
  onToggleActual: (block: MyDayBlock) => void;
}

const START_HOUR = 5;
const END_HOUR = 23;
const ROW_HEIGHT_PX = 64;

// Sources whose "actual" status can be toggled from My Day directly.
// burnlog is read-only here — you can't toggle a workout into existing.
const TOGGLEABLE_SOURCES: MyDayBlock['source'][] = ['habit', 'tasklog', 'homelog'];

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

interface LaidOutBlock {
  block: MyDayBlock;
  column: number;
  columnCount: number;
}

// Assigns each block a column so blocks that overlap in time stack
// side-by-side instead of on top of each other.
function assignLanes(blocks: MyDayBlock[]): LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const result: LaidOutBlock[] = [];

  let cluster: LaidOutBlock[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columnCount = Math.max(...cluster.map((item) => item.column)) + 1;
    for (const item of cluster) {
      item.columnCount = columnCount;
      result.push(item);
    }
    cluster = [];
  };

  for (const block of sorted) {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);

    if (start >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }

    let column = 0;
    while (cluster.some((item) => item.column === column && timeToMinutes(item.block.endTime) > start)) {
      column += 1;
    }

    cluster.push({ block, column, columnCount: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flushCluster();

  return result;
}

export function DayTimeline({ blocks, onBlockClick, onSlotClick, onToggleActual }: DayTimelineProps) {
  const { colorFor } = useAppThemeColors();
  const sourceColors: Record<MyDayBlock['source'], string> = {
    manual: 'var(--muted-foreground)',
    burnlog: colorFor('burnlog'),
    tasklog: colorFor('tasklog'),
    moneylog: colorFor('moneylog'),
    homelog: colorFor('homelog'),
    habit: 'var(--chart-2)',
  };
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
        {assignLanes(blocks).map(({ block, column, columnCount }) => {
          const top = ((timeToMinutes(block.startTime) - gridStartMinutes) / 60) * ROW_HEIGHT_PX;
          const height = Math.max(
            24,
            ((timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60) * ROW_HEIGHT_PX
          );
          const color = sourceColors[block.source];
          const canToggle =
            TOGGLEABLE_SOURCES.includes(block.source) &&
            block.actual !== null &&
            !(block.source === 'homelog' && block.actual);
          const widthPct = 100 / columnCount;

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onBlockClick(block)}
              className="pointer-events-auto absolute rounded-sm border-l-4 bg-card p-1.5 text-left shadow-sm"
              style={{
                top,
                height,
                left: `${column * widthPct}%`,
                width: `calc(${widthPct}% - 4px)`,
                borderLeftColor: color,
              }}
            >
              <div className="flex items-center gap-1">
                {block.actual !== null && (
                  <span
                    role={canToggle ? 'button' : undefined}
                    aria-label={canToggle ? 'Toggle complete' : undefined}
                    onClick={(e) => {
                      if (!canToggle) return;
                      e.stopPropagation();
                      onToggleActual(block);
                    }}
                  >
                    {block.actual ? (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    ) : (
                      <Circle className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                )}
                <p className={cn('truncate text-[10px] font-medium', block.completed && 'text-muted-foreground line-through')}>
                  {block.title}
                </p>
              </div>
              <p className="truncate text-[9px] text-muted-foreground">
                {block.startTime}–{block.endTime}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
