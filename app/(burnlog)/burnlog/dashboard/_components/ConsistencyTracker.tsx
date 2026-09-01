'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Flame, X, Calendar, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeLevel } from '@/lib/leveling';
import { computeConsistencyWeek, getWeekId, getWeekRange, WEEKLY_CONSISTENCY_BONUS_XP } from '@/lib/consistency';
import { AchievementOverlay } from '@/components/AchievementOverlay';

type ConsistencyTrackerProps = {
  profileId: string;
  currentStreak: number;
  xp: number;
  level: number;
  lastConsistencyBonusWeek: string | null;
  /** Bump to force a re-fetch after activity is logged elsewhere on the dashboard. */
  refreshKey?: number;
};

const TABLES_WITH_DATE = ['sessions', 'calorie_burns', 'food_intakes', 'step_entries', 'stamina_sessions', 'weight_entries'] as const;

export function ConsistencyTracker({
  profileId,
  currentStreak,
  xp,
  level,
  lastConsistencyBonusWeek,
  refreshKey,
}: ConsistencyTrackerProps) {
  const supabase = createClient();
  const [activeDates, setActiveDates] = useState<Set<string> | null>(null);
  const [achievement, setAchievement] = useState<{ stats: string[] } | null>(null);
  const awardInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeekActivity() {
      const { start, end } = getWeekRange();
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const results = await Promise.all(
        TABLES_WITH_DATE.map((table) =>
          supabase
            .from(table)
            .select('date')
            .eq('profileId', profileId)
            .gte('date', startIso)
            .lt('date', endIso)
        )
      );

      const dates = new Set<string>();
      for (const { data } of results) {
        for (const row of data ?? []) {
          dates.add(String(row.date).split('T')[0]);
        }
      }

      if (!cancelled) setActiveDates(dates);
    }

    fetchWeekActivity();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, refreshKey]);

  const week = activeDates ? computeConsistencyWeek(activeDates) : null;

  useEffect(() => {
    if (!week || !week.isFullWeek || awardInFlight.current) return;

    const weekId = getWeekId();
    if (lastConsistencyBonusWeek === weekId) return;

    awardInFlight.current = true;

    (async () => {
      const newXp = xp + WEEKLY_CONSISTENCY_BONUS_XP;
      const newLevel = computeLevel(newXp);
      const { error } = await supabase
        .from('profiles')
        .update({ xp: newXp, level: newLevel, lastConsistencyBonusWeek: weekId })
        .eq('id', profileId);

      if (!error) {
        const stats = [`+${WEEKLY_CONSISTENCY_BONUS_XP} XP`, 'Calendar Full week!'];
        if (newLevel > level) stats.push(`Level ${newLevel}!`);
        setAchievement({ stats });
      }
    })();
  }, [week, lastConsistencyBonusWeek, profileId, xp, level, supabase]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">This Week</CardTitle>
        {currentStreak > 0 && (
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <Flame className="size-4" />
            {currentStreak} day{currentStreak === 1 ? '' : 's'}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex justify-between gap-1">
          {week?.days.map((day) => (
            <div key={day.date} className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
              <div
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 transition-colors',
                  day.status === 'done' && 'border-primary bg-primary text-primary-foreground',
                  day.status === 'missed' && 'border-transparent bg-muted text-muted-foreground',
                  day.status === 'today' && 'border-primary border-dashed bg-transparent text-primary',
                  day.status === 'upcoming' && 'border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground/40'
                )}
              >
                {day.status === 'done' && <Check className="size-4" />}
                {day.status === 'missed' && <X className="size-3.5" />}
              </div>
            </div>
          ))}
        </div>
        {week && (
          <p className="mt-3 text-sm text-muted-foreground flex items-center gap-1">
            <span>{week.activeCount} of 7 days active this week</span>
            {week.isFullWeek && <><span>— full week!</span><PartyPopper className="w-4 h-4" /></>}
          </p>
        )}
      </CardContent>

      <AchievementOverlay
        open={!!achievement}
        title="Full Week!"
        message="You showed up every single day this week."
        stats={achievement?.stats ?? []}
        celebrate
        autoCloseMs={4000}
        onClose={() => setAchievement(null)}
      />
    </Card>
  );
}
