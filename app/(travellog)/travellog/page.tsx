// app/(travellog)/travellog/page.tsx
'use client';

import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';

async function fetchVisits(profileId: string): Promise<TravelVisitRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('travellog_visits')
    .select('*')
    .eq('profileId', profileId)
    .order('arrivalDate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelVisitRow[];
}

export default function TravelLogHomePage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data: visits, isLoading } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );

  const loading = profileLoading || isLoading;
  const totalVisits = visits?.length ?? 0;
  const countries = new Set((visits ?? []).map((v) => v.country)).size;
  const exploredCount = (visits ?? []).filter(isExplored).length;

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="TravelLog" />
      <div className="p-4 flex flex-col gap-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{totalVisits}</p>
              <p className="text-xs text-muted-foreground">Visits</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{countries}</p>
              <p className="text-xs text-muted-foreground">Countries</p>
            </StatCard>
            <StatCard className="text-center">
              <p className="text-2xl font-bold">{exploredCount}</p>
              <p className="text-xs text-muted-foreground">Explored</p>
            </StatCard>
          </div>
        )}
        {!loading && totalVisits === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No trips logged yet. Head to the Map tab to log your first visit.
            </CardContent>
          </Card>
        )}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
