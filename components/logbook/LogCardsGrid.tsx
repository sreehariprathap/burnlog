// components/logbook/LogCardsGrid.tsx
'use client';

import { Flame, ListChecks, Wallet, Moon, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAppSwitch } from '@/lib/appSwitchContext';
import type { AppId } from '@/lib/appMode';
import type { LogbookCard } from '@/lib/logbook/today';

const CARD_META: Record<LogbookCard['app'], { icon: LucideIcon; color: string; appId: AppId | null }> = {
  burnlog: { icon: Flame, color: '#F97316', appId: 'burnlog' },
  tasklog: { icon: ListChecks, color: '#3B82F6', appId: 'tasklog' },
  moneylog: { icon: Wallet, color: '#22C55E', appId: 'moneylog' },
  lifelog: { icon: Moon, color: '#8B5CF6', appId: null },
};

function formatValue(card: LogbookCard): string {
  if (!card.available) return 'Coming soon';
  if (card.app === 'moneylog') {
    return `₹${Math.round(card.value).toLocaleString()} / ₹${Math.round(card.target).toLocaleString()}`;
  }
  if (card.app === 'tasklog') {
    return `${card.value} / ${card.target} tasks`;
  }
  return `${Math.round(card.value).toLocaleString()} / ${Math.round(card.target).toLocaleString()} ${card.unit}`;
}

interface LogCardsGridProps {
  cards: LogbookCard[];
}

export function LogCardsGrid({ cards }: LogCardsGridProps) {
  const { switchTo } = useAppSwitch();

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => {
        const meta = CARD_META[card.app];
        const Icon = meta.icon;
        const disabled = !card.available || !meta.appId;

        return (
          <Card
            key={card.app}
            onClick={() => meta.appId && switchTo(meta.appId)}
            className={disabled ? 'opacity-70' : 'cursor-pointer transition-transform active:scale-[0.98]'}
          >
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5" style={{ color: meta.color }} />
                {card.pct !== null && (
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{card.pct}%</span>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-sm font-semibold">{formatValue(card)}</p>
              </div>
              {card.pct !== null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, card.pct)}%`, backgroundColor: meta.color }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
