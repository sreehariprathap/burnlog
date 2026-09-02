// app/(learnlog)/learnlog/skills/[id]/page.tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame } from 'lucide-react';
import type { SkillRow, SkillSessionRow, SkillMilestoneRow } from '@/lib/learnlog/types';
import { LogSessionDrawer } from './_components/LogSessionDrawer';
import { MilestoneList } from './_components/MilestoneList';
import { NearbyClassesCard } from './_components/NearbyClassesCard';

async function fetchSkill(id: string): Promise<SkillRow> {
  const supabase = createClient();
  const { data, error } = await supabase.from('learnlog_skills').select('*').eq('id', id).single();
  if (error) throw error;
  return data as SkillRow;
}

async function fetchSessions(skillId: string): Promise<SkillSessionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skill_sessions')
    .select('*')
    .eq('skillId', skillId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SkillSessionRow[];
}

async function fetchMilestones(skillId: string): Promise<SkillMilestoneRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('learnlog_skill_milestones')
    .select('*')
    .eq('skillId', skillId)
    .order('createdAt', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SkillMilestoneRow[];
}

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const skillId = params.id;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: skill, isLoading: skillLoading, mutate: mutateSkill } = useSWR(
    ['learnlog-skill', skillId],
    () => fetchSkill(skillId)
  );
  const { data: sessions, mutate: mutateSessions } = useSWR(
    ['learnlog-skill-sessions', skillId],
    () => fetchSessions(skillId)
  );
  const { data: milestones, mutate: mutateMilestones } = useSWR(
    ['learnlog-skill-milestones', skillId],
    () => fetchMilestones(skillId)
  );

  if (skillLoading || !skill) {
    return (
      <div className="min-h-screen pb-24 p-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title={skill.name} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">Level {skill.level}</p>
              <p className="text-xs text-muted-foreground">{skill.xp} XP</p>
            </div>
            {skill.currentStreak > 0 && (
              <span className="flex items-center text-sm text-muted-foreground">
                <Flame className="h-4 w-4 mr-1" /> {skill.currentStreak} day streak
              </span>
            )}
          </CardContent>
        </Card>

        <Button onClick={() => setDrawerOpen(true)} className="w-full">Log a session</Button>

        <MilestoneList skillId={skill.id} milestones={milestones ?? []} onChanged={() => mutateMilestones()} />

        <NearbyClassesCard skill={skill} />

        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">Recent sessions</p>
          {(sessions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No sessions logged yet.</p>
          )}
          {(sessions ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-3 pb-3 flex items-center justify-between text-sm">
                <span>{s.date}{s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}</span>
                <span className="text-muted-foreground">+{s.xpEarned} XP</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <LogSessionDrawer
        skill={skill}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSaved={() => { mutateSkill(); mutateSessions(); }}
      />
      <LearnLogBottomNav />
    </div>
  );
}
