// app/(learnlog)/learnlog/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { LearnLogBottomNav } from '@/components/LearnLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame } from 'lucide-react';
import { GroupInvitesBanner } from '@/components/learnlog/GroupInvitesBanner';
import type { SkillRow, LibraryItemRow, CareerGoalRow } from '@/lib/learnlog/types';

async function fetchHomeData(profileId: string) {
  const supabase = createClient();
  const [skillsRes, libraryRes, goalsRes] = await Promise.all([
    supabase.from('learnlog_skills').select('*').eq('profileId', profileId).order('currentStreak', { ascending: false }),
    supabase.from('learnlog_library_items').select('*').eq('profileId', profileId).eq('status', 'IN_PROGRESS').order('updatedAt', { ascending: false }).limit(1),
    supabase.from('learnlog_career_goals').select('*').eq('profileId', profileId).eq('status', 'active').order('targetDate', { ascending: true }).limit(1),
  ]);
  if (skillsRes.error) throw skillsRes.error;
  if (libraryRes.error) throw libraryRes.error;
  if (goalsRes.error) throw goalsRes.error;
  return {
    skills: (skillsRes.data ?? []) as SkillRow[],
    inProgressBook: (libraryRes.data?.[0] ?? null) as LibraryItemRow | null,
    nextGoal: (goalsRes.data?.[0] ?? null) as CareerGoalRow | null,
  };
}

export default function LearnLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? ['learnlog-home', profile.id] : null,
    () => fetchHomeData(profile!.id)
  );

  const loading = profileLoading || isLoading;
  const skills = data?.skills ?? [];
  const topSkill = skills[0] ?? null;
  const skillCount = skills.length;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="LearnLog" />
      <div className="p-4 flex flex-col gap-4">
        <GroupInvitesBanner />
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{skillCount}</p>
              <p className="text-xs text-muted-foreground">Skills tracked</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold flex items-center justify-center gap-1">
                {topSkill?.currentStreak ?? 0}
                {(topSkill?.currentStreak ?? 0) > 0 && <Flame className="h-4 w-4" />}
              </p>
              <p className="text-xs text-muted-foreground">Best streak</p>
            </StatCard>
          </div>
        )}

        {!loading && data?.inProgressBook && (
          <Link href="/learnlog/library">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Currently reading/taking</p>
                <p className="font-medium">{data.inProgressBook.title}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {!loading && data?.nextGoal && (
          <Link href="/learnlog/career">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Next career goal</p>
                <p className="font-medium">{data.nextGoal.title}</p>
                {data.nextGoal.targetDate && <p className="text-xs text-muted-foreground">Target: {data.nextGoal.targetDate}</p>}
              </CardContent>
            </Card>
          </Link>
        )}

        {!loading && skillCount === 0 && !data?.inProgressBook && !data?.nextGoal && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              Nothing tracked yet. Head to Library, Skills, or Career to get started.
            </CardContent>
          </Card>
        )}
      </div>
      <LearnLogBottomNav />
    </div>
  );
}
