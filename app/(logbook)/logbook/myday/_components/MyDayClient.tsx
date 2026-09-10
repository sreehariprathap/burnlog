'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarClock, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { format as formatDate, addDays, subDays } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { ThemedButton } from '@/components/ui/themed-button';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { markTaskComplete } from '@/lib/tasklog/completeTask';
import type { StreakProfile } from '@/lib/tasklog/streak';
import { DayTimeline } from '@/components/myday/DayTimeline';
import { UnscheduledTray } from '@/components/myday/UnscheduledTray';
import { AddBlockSheet } from '@/components/myday/AddBlockSheet';
import { MyDayCalendarDialog } from '@/components/myday/MyDayCalendarDialog';
import { HabitCreateSheet } from '@/components/myday/HabitCreateSheet';
import { RadialMenu, type RadialMenuItem } from '@/components/kokonutui/radial-menu';
import type { MyDayBlock, MyDayUnscheduledItem } from '@/lib/myday/types';
import { myDayQuery, todayKey } from '@/lib/logbook/queries';

type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock }
  | { mode: 'newHabit' };

export function MyDayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') ?? todayKey();
  const { profile } = useCurrentProfile();
  const { data, isLoading, error, mutate } = useSWR(
    profile ? myDayQuery(date).key : null,
    profile ? myDayQuery(date).fetcher : null
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const goToDate = (next: string) => router.push(`/logbook?tab=myday&date=${next}`);

  const dateLabel = useMemo(() => formatDate(new Date(`${date}T00:00:00`), 'EEEE, MMM d'), [date]);

  const closeSheet = () => setSheet({ mode: 'closed' });
  const handleSheetSaved = () => {
    mutate();
    closeSheet();
  };

  async function handleToggleActual(block: MyDayBlock) {
    if (!block.sourceId) return;
    const supabase = createClient();

    if (block.source === 'habit') {
      await fetch(`/api/habits/occurrences/${block.sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !block.actual }),
      });
    } else if (block.source === 'tasklog') {
      if (!profile) return;
      const { data: task } = await supabase
        .from('tasklog_tasks')
        .select('id, goalId, title, cost, costCategory, costLoggedAt')
        .eq('id', block.sourceId)
        .single();
      if (!task) return;
      const streakProfile: StreakProfile = {
        id: profile.id,
        taskLogCurrentStreak: profile.taskLogCurrentStreak as number,
        taskLogLongestStreak: profile.taskLogLongestStreak as number,
        lastTaskLogStreakDate: profile.lastTaskLogStreakDate as string | null,
      };
      await markTaskComplete(supabase, task, streakProfile, !block.actual);
    } else if (block.source === 'homelog') {
      if (block.actual) return; // one-way, matches HomeLog's own completion flow
      await fetch(`/api/homelog/chores/instances/${block.sourceId}/complete`, { method: 'POST' });
    }

    mutate();
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <TopBar
        title="MyDay"
        actions={
          <>
            <button type="button" onClick={() => setCalendarOpen(true)} aria-label="Open calendar" className="flex items-center justify-center">
              <CalendarDays className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => mutate()} aria-label="Refresh" className="flex items-center justify-center">
              <RefreshCw className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous day"
            onClick={() => goToDate(formatDate(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}
          >
            ←
          </Button>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next day"
            onClick={() => goToDate(formatDate(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}
          >
            →
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!isLoading && error && <p className="text-sm text-muted-foreground">Couldn&apos;t load MyDay.</p>}

        {!isLoading && data && (
          <>
            <UnscheduledTray items={data.unscheduled} onSelect={(item) => setSheet({ mode: 'fromUnscheduled', item })} />
            <DayTimeline
              blocks={data.blocks}
              onBlockClick={(block) => setSheet({ mode: 'edit', block })}
              onSlotClick={(startTime) => setSheet({ mode: 'new', startTime })}
              onToggleActual={handleToggleActual}
            />
          </>
        )}
      </div>

      <ThemedButton
        slot="fab"
        onClick={() => setFabMenuOpen((prev) => !prev)}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add to your day"
      >
        <Plus className="h-6 w-6" />
      </ThemedButton>

      <RadialMenu
        open={fabMenuOpen}
        onClose={() => setFabMenuOpen(false)}
        items={
          [
            {
              key: 'block',
              label: 'Block',
              icon: <CalendarClock className="h-5 w-5" />,
              onSelect: () => setSheet({ mode: 'new' }),
            },
            {
              key: 'habit',
              label: 'Habit',
              icon: <Plus className="h-5 w-5" />,
              onSelect: () => setSheet({ mode: 'newHabit' }),
            },
          ] satisfies RadialMenuItem[]
        }
      />

      {sheet.mode === 'newHabit' && <HabitCreateSheet date={date} onClose={closeSheet} onSaved={handleSheetSaved} />}

      {sheet.mode === 'new' && (
        <AddBlockSheet date={date} initialStartTime={sheet.startTime} onClose={closeSheet} onSaved={handleSheetSaved} />
      )}
      {sheet.mode === 'fromUnscheduled' && (
        <AddBlockSheet
          date={date}
          prefillTitle={sheet.item.title}
          prefillSource={sheet.item.source}
          prefillSourceId={sheet.item.sourceId}
          onClose={closeSheet}
          onSaved={handleSheetSaved}
        />
      )}
      {sheet.mode === 'edit' && <AddBlockSheet date={date} block={sheet.block} onClose={closeSheet} onSaved={handleSheetSaved} />}

      <MyDayCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} selectedDate={date} onSelectDate={goToDate} />
    </div>
  );
}
