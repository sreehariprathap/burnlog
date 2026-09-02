// components/logbook/ActivityTimeline.tsx
import { format } from 'date-fns';
import { Flame, ListChecks, Wallet, Home, type LucideIcon } from 'lucide-react';
import type { LogbookActivityEvent } from '@/lib/logbook/today';
import { appSearchColor } from '@/lib/search/registry';

const APP_META: Record<LogbookActivityEvent['app'], { icon: LucideIcon; color: string }> = {
  burnlog: { icon: Flame, color: appSearchColor('burnlog') },
  tasklog: { icon: ListChecks, color: appSearchColor('tasklog') },
  moneylog: { icon: Wallet, color: appSearchColor('moneylog') },
  homelog: { icon: Home, color: appSearchColor('homelog') },
};

interface ActivityTimelineProps {
  events: LogbookActivityEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing logged yet today. Activity from every app will show up here as it happens.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-1">
      {events.map((event, index) => {
        const meta = APP_META[event.app];
        const Icon = meta.icon;
        return (
          <li key={`${event.app}-${event.time}-${index}`} className="flex items-start gap-3 py-2">
            <div className="flex flex-col items-center">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${meta.color}1a` }}
              >
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
              </div>
              {index < events.length - 1 && <div className="mt-1 h-full w-px flex-1 bg-border" />}
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm">{event.label}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(event.time), 'h:mmaaa')}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
