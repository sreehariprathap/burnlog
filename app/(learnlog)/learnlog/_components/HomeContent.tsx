'use client';

import { useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { FlameIcon, type FlameIconHandle } from '@/components/ui/flame';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { GroupInvitesBanner } from '@/components/learnlog/GroupInvitesBanner';
import { homeDataQuery } from '@/lib/learnlog/queries';

export function HomeContent() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data, isLoading } = useSWR(
    profile ? homeDataQuery(profile.id).key : null,
    profile ? homeDataQuery(profile.id).fetcher : null
  );

  const flameIconRef = useRef<FlameIconHandle>(null);
  useMountAnimation(flameIconRef);

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
                {(topSkill?.currentStreak ?? 0) > 0 && <FlameIcon ref={flameIconRef} size={16} />}
              </p>
              <p className="text-xs text-muted-foreground">Best streak</p>
            </StatCard>
          </div>
        )}

        {!loading && data?.inProgressBook && (
          <Link href="/learnlog?tab=library">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Currently reading/taking</p>
                <p className="font-medium">{data.inProgressBook.title}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {!loading && data?.nextGoal && (
          <Link href="/learnlog?tab=career">
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
    </div>
  );
}
