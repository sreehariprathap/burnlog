// components/LearnLogSummaryCard.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { LearnLogMark } from '@/components/LearnLogMark';
import { Flame } from 'lucide-react';

type LearnLogSummaryCardProps = {
  profileId: string;
};

async function fetchSummary(profileId: string) {
  const supabase = createClient();
  const [skillsRes, libraryRes] = await Promise.all([
    supabase.from('learnlog_skills').select('name,currentStreak').eq('profileId', profileId).order('currentStreak', { ascending: false }).limit(1),
    supabase.from('learnlog_library_items').select('title').eq('profileId', profileId).eq('status', 'IN_PROGRESS').order('updatedAt', { ascending: false }).limit(1),
  ]);
  return {
    topSkill: skillsRes.data?.[0] as { name: string; currentStreak: number } | undefined,
    inProgressTitle: libraryRes.data?.[0]?.title as string | undefined,
  };
}

export function LearnLogSummaryCard({ profileId }: LearnLogSummaryCardProps) {
  const { data } = useSWR(['learnlog-summary', profileId], () => fetchSummary(profileId));

  return (
    <Link href="/learnlog">
      <Card>
        <CardContent className="pt-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LearnLogMark size={18} />
            <span className="text-sm font-medium">LearnLog</span>
          </div>
          {data?.topSkill ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {data.topSkill.name}
              {data.topSkill.currentStreak > 0 && (
                <span className="flex items-center"><Flame className="h-3 w-3 mx-0.5" />{data.topSkill.currentStreak}</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No skills tracked yet</p>
          )}
          {data?.inProgressTitle && (
            <p className="text-xs text-muted-foreground">Reading: {data.inProgressTitle}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
