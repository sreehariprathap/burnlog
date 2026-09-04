'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Flame } from 'lucide-react';
import { skillsQuery } from '@/lib/learnlog/queries';
import { SkillDrawer } from './SkillDrawer';

export function SkillsContent() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: skills, isLoading, mutate } = useSWR(
    profile ? skillsQuery(profile.id).key : null,
    profile ? skillsQuery(profile.id).fetcher : null
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Skills" />
      <div className="p-4 flex flex-col gap-4">
        <Button onClick={() => setDrawerOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add a skill
        </Button>

        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        )}

        {!isLoading && (skills ?? []).length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No skills yet. Add one — skiing, boxing, climbing, anything you&apos;re building.
            </CardContent>
          </Card>
        )}

        {(skills ?? []).map((skill) => (
          <Link key={skill.id} href={`/learnlog/skills/${skill.id}`}>
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{skill.name}</p>
                  <p className="text-xs text-muted-foreground">Level {skill.level} · {skill.xp} XP</p>
                </div>
                {skill.currentStreak > 0 && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    <Flame className="h-3 w-3 mr-0.5" /> {skill.currentStreak}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {profile && (
        <SkillDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}
