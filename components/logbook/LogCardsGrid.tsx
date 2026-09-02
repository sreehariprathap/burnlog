// components/logbook/LogCardsGrid.tsx
'use client';

import { Flame, ListChecks, Wallet, House, MessageCircle, ShoppingBag, ArrowRight, type LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { BentoGrid } from '@/components/ui/bento-grid';
import { cn } from '@/lib/utils';
import { useAppSwitch } from '@/lib/appSwitchContext';
import type { AppId } from '@/lib/appMode';
import type { LogbookCard } from '@/lib/logbook/today';
import { appSearchColor } from '@/lib/search/registry';

const CARD_META: Record<LogbookCard['app'], { icon: LucideIcon; color: string; appId: AppId }> = {
  burnlog: { icon: Flame, color: appSearchColor('burnlog'), appId: 'burnlog' },
  tasklog: { icon: ListChecks, color: appSearchColor('tasklog'), appId: 'tasklog' },
  moneylog: { icon: Wallet, color: appSearchColor('moneylog'), appId: 'moneylog' },
  homelog: { icon: House, color: appSearchColor('homelog'), appId: 'homelog' },
  sociallog: { icon: MessageCircle, color: appSearchColor('sociallog'), appId: 'sociallog' },
  shoppinglog: { icon: ShoppingBag, color: appSearchColor('shoppinglog'), appId: 'shoppinglog' },
};

// Hero tiles bookend the grid — everything else sits two-per-row between them.
const HERO_SPAN: Partial<Record<LogbookCard['app'], string>> = {
  burnlog: 'col-span-2 lg:col-span-3',
  shoppinglog: 'col-span-2 lg:col-span-3',
};

function formatValue(card: LogbookCard): string {
  if (!card.available) return 'Coming soon';
  if (card.app === 'moneylog') {
    return `₹${Math.round(card.value).toLocaleString()} / ₹${Math.round(card.target).toLocaleString()}`;
  }
  if (card.app === 'tasklog' || card.app === 'homelog') {
    return `${card.value} / ${card.target} ${card.unit}`;
  }
  if (card.app === 'sociallog' || card.app === 'shoppinglog') {
    return `${card.value} ${card.unit}`;
  }
  return `${Math.round(card.value).toLocaleString()} / ${Math.round(card.target).toLocaleString()} ${card.unit}`;
}

interface LogCardsGridProps {
  cards: LogbookCard[];
}

export function LogCardsGrid({ cards }: LogCardsGridProps) {
  const { switchTo } = useAppSwitch();

  return (
    <BentoGrid>
      {cards.map((card) => {
        const meta = CARD_META[card.app];
        const Icon = meta.icon;
        const disabled = !card.available;
        const isHero = card.app in HERO_SPAN;
        // Each tile represents ANOTHER app's data while sitting inside
        // LogBook's own indigo theme — override StatCard's ambient-theme
        // default with that app's own color, the same lookup GlobalSearch
        // uses for the identical "another app's color, outside its theme
        // context" problem.
        const tileColor = appSearchColor(meta.appId);

        return (
          <StatCard
            key={card.app}
            onClick={() => switchTo(meta.appId)}
            neonColors={{ firstColor: tileColor, secondColor: `${tileColor}99` }}
            className={cn(
              'relative overflow-hidden group',
              HERO_SPAN[card.app],
              disabled ? 'opacity-70' : 'cursor-pointer transition-transform active:scale-[0.98]'
            )}
          >
            <div className={cn('flex flex-col gap-2', isHero && 'lg:flex-row lg:items-center lg:justify-between')}>
              <div className={cn('flex flex-1 flex-col gap-2', isHero && 'lg:flex-row lg:items-center lg:gap-4')}>
                <div className="flex items-center justify-between">
                  <Icon className={cn('h-5 w-5', isHero && 'lg:h-6 lg:w-6')} style={{ color: meta.color }} />
                  {card.pct !== null && (
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground lg:hidden">
                      {card.pct}%
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-sm font-semibold">{formatValue(card)}</p>
                </div>
              </div>
              {card.pct !== null && (
                <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', isHero && 'lg:w-40')}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, card.pct)}%`, backgroundColor: meta.color }}
                  />
                </div>
              )}
            </div>
            {!disabled && (
              <ArrowRight
                className="pointer-events-none absolute right-3 top-3 size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
              />
            )}
          </StatCard>
        );
      })}
    </BentoGrid>
  );
}
