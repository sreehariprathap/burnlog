// components/CrossAppSnapshot.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { FlameIcon, ListChecksIcon, WalletIcon, HomeIcon, MessageCircleIcon, ShoppingCartIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AppId } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { getCrossAppSnapshot, type CrossAppSnapshot as SnapshotData } from '@/lib/crossApp/snapshot';

interface CrossAppSnapshotProps {
  currentApp: AppId;
  profileId: string;
}

interface Chip {
  app: AppId;
  icon: React.ReactNode;
  label: string;
}

function buildChips(currentApp: AppId, data: SnapshotData): Chip[] {
  const chips: Chip[] = [];

  if (currentApp !== 'burnlog' && data.burnlogStreak !== null) {
    chips.push({
      app: 'burnlog',
      icon: <FlameIcon className="h-4 w-4 text-orange-500" />,
      label: `${data.burnlogStreak}-day streak`,
    });
  }

  if (currentApp !== 'moneylog' && data.moneylogWeeklyNet !== null) {
    const net = Math.round(data.moneylogWeeklyNet);
    chips.push({
      app: 'moneylog',
      icon: <WalletIcon className="h-4 w-4 text-emerald-500" />,
      label: `${net >= 0 ? '+' : ''}$${net} this week`,
    });
  }

  if (currentApp !== 'tasklog' && (data.tasklogStreak !== null || data.tasklogDueToday > 0)) {
    chips.push({
      app: 'tasklog',
      icon: <ListChecksIcon className="h-4 w-4 text-blue-500" />,
      label: `${data.tasklogDueToday} due today`,
    });
  }

  if (currentApp !== 'homelog' && data.homelogChoresDueToday > 0) {
    chips.push({
      app: 'homelog',
      icon: <HomeIcon className="h-4 w-4 text-purple-500" />,
      label: `${data.homelogChoresDueToday} chores due`,
    });
  }

  if (currentApp !== 'sociallog' && data.sociallogUnreadCount !== null) {
    chips.push({
      app: 'sociallog',
      icon: <MessageCircleIcon className="h-4 w-4 text-pink-500" />,
      label: `${data.sociallogUnreadCount} unread`,
    });
  }

  if (currentApp !== 'shoppinglog' && data.shoppinglogCartCount !== null) {
    chips.push({
      app: 'shoppinglog',
      icon: <ShoppingCartIcon className="h-4 w-4 text-[#f18701]" />,
      label: `${data.shoppinglogCartCount} in cart`,
    });
  }

  return chips;
}

export function CrossAppSnapshot({ currentApp, profileId }: CrossAppSnapshotProps) {
  const supabase = createClientComponentClient();
  const { switchTo } = useAppSwitch();
  const [chips, setChips] = useState<Chip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getCrossAppSnapshot(supabase, profileId);
      if (!cancelled) setChips(buildChips(currentApp, data));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, currentApp]);

  if (chips === null) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        {chips.map((chip) => (
          <button
            key={chip.app}
            type="button"
            onClick={() => switchTo(chip.app)}
            className="flex items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent"
          >
            {chip.icon}
            <span className="text-xs font-medium">{chip.label}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
