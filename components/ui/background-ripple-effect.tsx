'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

type CellCoords = { row: number; col: number };

interface BackgroundRippleEffectProps {
  className?: string;
  /** Cell width/height in px — the grid auto-fills its container at this size. */
  cellSize?: number;
  borderColor?: string;
  fillColor?: string;
  /** Duration (ms) of a single cell's ripple pulse. */
  duration?: number;
  /** Extra delay (ms) added per unit of distance from the clicked cell. */
  delayPerCell?: number;
  interactive?: boolean;
}

/**
 * A grid of bordered cells that ripple outward from wherever the user
 * clicks — cells farther from the click point light up with a longer
 * animation-delay, producing a wave-like pulse across the grid.
 * Grid dimensions auto-fit the container size; skips the click animation
 * entirely for prefers-reduced-motion.
 */
export function BackgroundRippleEffect({
  className,
  cellSize = 56,
  borderColor = 'var(--border)',
  fillColor = 'transparent',
  duration = 600,
  delayPerCell = 55,
  interactive = true,
}: BackgroundRippleEffectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState({ rows: 0, cols: 0 });
  const shouldReduceMotion = useReducedMotion();
  const [clickedCell, setClickedCell] = useState<CellCoords | null>(null);
  const [rippleId, setRippleId] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setGrid({
        cols: Math.max(1, Math.ceil(width / cellSize)),
        rows: Math.max(1, Math.ceil(height / cellSize)),
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cellSize]);

  const handleCellClick = (cell: CellCoords) => {
    if (!interactive || shouldReduceMotion) return;
    setClickedCell(cell);
    setRippleId((id) => id + 1);
  };

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-auto absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      {grid.rows > 0 && grid.cols > 0 && (
        <DivGrid
          rows={grid.rows}
          cols={grid.cols}
          cellSize={cellSize}
          borderColor={borderColor}
          fillColor={fillColor}
          clickedCell={clickedCell}
          rippleId={rippleId}
          duration={duration}
          delayPerCell={delayPerCell}
          interactive={interactive}
          onCellClick={handleCellClick}
        />
      )}
    </div>
  );
}

interface DivGridProps {
  rows: number;
  cols: number;
  cellSize: number;
  borderColor: string;
  fillColor: string;
  clickedCell: CellCoords | null;
  rippleId: number;
  duration: number;
  delayPerCell: number;
  interactive: boolean;
  onCellClick: (cell: CellCoords) => void;
}

function DivGrid({
  rows,
  cols,
  cellSize,
  borderColor,
  fillColor,
  clickedCell,
  rippleId,
  duration,
  delayPerCell,
  interactive,
  onCellClick,
}: DivGridProps) {
  const cells = React.useMemo(
    () => Array.from({ length: rows * cols }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols })),
    [rows, cols]
  );

  return (
    <div
      // Remounting on every click (rather than just updating each cell's
      // style) guarantees the ripple replays even if the same cell is
      // clicked twice in a row, since React can't detect "restart this
      // CSS animation" from an unchanged style object alone.
      key={rippleId}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
      }}
    >
      {cells.map(({ row, col }) => {
        const distance = clickedCell
          ? Math.hypot(row - clickedCell.row, col - clickedCell.col)
          : null;
        const isRippling = distance !== null;

        return (
          <div
            key={`${row}-${col}`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? -1 : undefined}
            onClick={interactive ? () => onCellClick({ row, col }) : undefined}
            className={cn('border', interactive && 'cursor-pointer')}
            style={{
              borderColor,
              backgroundColor: fillColor,
              // Resting cells sit dim so a rippling cell's animated peak
              // (opacity 0.8, via the keyframe below) actually reads as a
              // highlight instead of blending into the idle grid.
              opacity: 0.4,
              ...(isRippling
                ? {
                    animationName: 'cell-ripple',
                    animationTimingFunction: 'ease-out',
                    animationIterationCount: 1,
                    animationDuration: `${duration}ms`,
                    animationDelay: `${(distance ?? 0) * delayPerCell}ms`,
                  }
                : undefined),
            }}
          />
        );
      })}
    </div>
  );
}
