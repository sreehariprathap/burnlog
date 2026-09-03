'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { format as formatDate, addDays, subDays } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { LogbookBottomNav } from '@/components/LogbookBottomNav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { DayTimeline } from '@/components/myday/DayTimeline';
import { UnscheduledTray } from '@/components/myday/UnscheduledTray';
import { AddBlockSheet } from '@/components/myday/AddBlockSheet';
import { MyDayCalendarDialog } from '@/components/myday/MyDayCalendarDialog';
import type { MyDayBlock, MyDayUnscheduledItem } from '@/lib/myday/types';
import { myDayQuery, todayKey } from '@/lib/logbook/queries';

type SheetState =
  | { mode: 'closed' }
  | { mode: 'new'; startTime?: string }
  | { mode: 'fromUnscheduled'; item: MyDayUnscheduledItem }
  | { mode: 'edit'; block: MyDayBlock };

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

  const goToDate = (next: string) => router.push(`/logbook/myday?date=${next}`);

  const dateLabel = useMemo(() => formatDate(new Date(`${date}T00:00:00`), 'EEEE, MMM d'), [date]);

  const closeSheet = () => setSheet({ mode: 'closed' });
  const handleSheetSaved = () => {
    mutate();
    closeSheet();
  };

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
          <Button variant="ghost" size="sm" onClick={() => goToDate(formatDate(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}>
            ←
          </Button>
          <p className="text-sm font-semibold">{dateLabel}</p>
          <Button variant="ghost" size="sm" onClick={() => goToDate(formatDate(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))}>
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
            />
          </>
        )}
      </div>

      <Button
        onClick={() => setSheet({ mode: 'new' })}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add to your day"
      >
        <Plus className="h-6 w-6" />
      </Button>

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

      <LogbookBottomNav />
    </div>
  );
}
