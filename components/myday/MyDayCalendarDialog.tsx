'use client';

import { useEffect, useMemo, useState } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format as formatDate, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface MyDayCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MyDayCalendarDialog({ open, onOpenChange, selectedDate, onSelectDate }: MyDayCalendarDialogProps) {
  const [cursor, setCursor] = useState(() => new Date(`${selectedDate}T00:00:00`));
  const [daysWithBlocks, setDaysWithBlocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setCursor(new Date(`${selectedDate}T00:00:00`));
  }, [open, selectedDate]);

  const month = formatDate(cursor, 'yyyy-MM');

  useEffect(() => {
    if (!open) return;
    fetch(`/api/myday/calendar?month=${month}`)
      .then((res) => res.json())
      .then((data) => setDaysWithBlocks(new Set(data.daysWithBlocks ?? [])))
      .catch(() => setDaysWithBlocks(new Set()));
  }, [open, month]);

  const weeks = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const days = eachDayOfInterval({ start, end });
    const leadingBlanks: null[] = Array(getDay(start)).fill(null);
    const cells: (Date | null)[] = [...leadingBlanks, ...days];
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <DialogTitle>{formatDate(cursor, 'MMMM yyyy')}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flatMap((week, wi) =>
            week.map((day, di) => {
              if (!day) return <span key={`${wi}-${di}`} />;
              const key = formatDate(day, 'yyyy-MM-dd');
              const hasBlocks = daysWithBlocks.has(key);
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onSelectDate(key);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-full text-sm',
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {formatDate(day, 'd')}
                  {hasBlocks && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
