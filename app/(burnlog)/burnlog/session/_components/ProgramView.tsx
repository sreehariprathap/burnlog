// app/(burnlog)/session/_components/ProgramView.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { computeLevel } from '@/lib/leveling';
import { AchievementOverlay } from '@/components/AchievementOverlay';
import { Mountain } from 'lucide-react';
import { RidgeProgress } from './RidgeProgress';
import { ProgramWeekAccordion, type ProgramWeekRow } from './ProgramWeekAccordion';
import { ProgramCreateFlow } from './ProgramCreateFlow';

type ProgramRow = {
  id: string;
  title: string;
  subtitle: string | null;
  totalWeeks: number;
  startWeight: number | null;
  targetWeight: number | null;
  rules: string[];
  mealPlan: { meal1: string[]; meal2: string[]; eveningShake: string[]; snacks: string[]; flexMealNote: string };
};

const PROGRAM_WEEK_BONUS_XP = 40;

export function ProgramView({ profileId }: { profileId: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [weeks, setWeeks] = useState<ProgramWeekRow[]>([]);
  const [milestone, setMilestone] = useState<{ stats: string[] } | null>(null);

  const fetchProgram = useCallback(async () => {
    setLoading(true);
    const { data: programRow } = await supabase
      .from('programs')
      .select('id, title, subtitle, totalWeeks, startWeight, targetWeight, rules, mealPlan')
      .eq('profileId', profileId)
      .maybeSingle();

    if (!programRow) {
      setProgram(null);
      setWeeks([]);
      setLoading(false);
      return;
    }

    setProgram(programRow as ProgramRow);

    const { data: weekRows } = await supabase
      .from('program_weeks')
      .select('id, weekIndex, title, subtitle, socialActivity, soloActivity, checklist, milestoneAwarded')
      .eq('programId', programRow.id)
      .order('weekIndex', { ascending: true });

    setWeeks((weekRows ?? []) as ProgramWeekRow[]);
    setLoading(false);
  }, [supabase, profileId]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  const handleWeekUpdated = (updated: ProgramWeekRow) => {
    setWeeks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleMilestone = async (weekTitle: string) => {
    const { data: profileRow } = await supabase.from('profiles').select('xp, level').eq('id', profileId).single();
    if (!profileRow) return;

    const newXp = profileRow.xp + PROGRAM_WEEK_BONUS_XP;
    const newLevel = computeLevel(newXp);
    const { error } = await supabase.from('profiles').update({ xp: newXp, level: newLevel }).eq('id', profileId);

    if (!error) {
      const stats = [`+${PROGRAM_WEEK_BONUS_XP} XP`, `${weekTitle} complete!`];
      if (newLevel > profileRow.level) stats.push(`Level ${newLevel}!`);
      setMilestone({ stats });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (!program) {
    return <ProgramCreateFlow profileId={profileId} onCreated={fetchProgram} />;
  }

  const ridgeWeeks = weeks.map((w) => ({
    weekIndex: w.weekIndex,
    complete: w.checklist.length > 0 && w.checklist.every((item) => item.checked),
  }));

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{program.title}</CardTitle>
          {program.subtitle && <p className="text-sm text-muted-foreground">{program.subtitle}</p>}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          {program.startWeight && (
            <div>
              <div className="font-semibold">{program.startWeight}kg</div>
              <div className="text-xs text-muted-foreground">Start</div>
            </div>
          )}
          {program.targetWeight && (
            <div>
              <div className="font-semibold">{program.targetWeight}kg</div>
              <div className="text-xs text-muted-foreground">Target</div>
            </div>
          )}
          <div>
            <div className="font-semibold">{program.totalWeeks}</div>
            <div className="text-xs text-muted-foreground">Weeks</div>
          </div>
        </CardContent>
      </Card>

      <RidgeProgress weeks={ridgeWeeks} />

      {program.rules.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">The Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {program.rules.map((rule, i) => (
                <li key={i} className="rounded-lg border px-3 py-2 text-sm">
                  {rule}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nutrition Guidance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ['Meal 1', program.mealPlan.meal1],
              ['Meal 2', program.mealPlan.meal2],
              ['Evening Shake', program.mealPlan.eveningShake],
              ['Snacks', program.mealPlan.snacks],
            ] as const
          )
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="mb-1 text-sm font-medium text-primary">{label}</div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          {program.mealPlan.flexMealNote && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:col-span-2">
              <div className="mb-1 text-sm font-medium text-primary">Flex Meal</div>
              <p className="text-xs text-muted-foreground">{program.mealPlan.flexMealNote}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {weeks.map((week) => (
          <ProgramWeekAccordion
            key={week.id}
            week={week}
            onWeekUpdated={handleWeekUpdated}
            onMilestone={handleMilestone}
          />
        ))}
      </div>

      <AchievementOverlay
        open={!!milestone}
        title="Week Complete!"
        message="Every item checked off — that's how the whole program gets finished."
        stats={milestone?.stats ?? []}
        celebrate
        autoCloseMs={4000}
        onClose={() => setMilestone(null)}
      />
    </div>
  );
}
