// app/(travellog)/travellog/map/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';
import { LogVisitDrawer } from './_components/LogVisitDrawer';
import WorldMap from '@/components/ui/world-map';

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

export default function TravelLogMapPage() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? ['travellog-visits', profile.id] : null,
    () => fetchVisits(profile!.id)
  );

  const sorted = visits ?? [];
  const dots = sorted.slice(1).map((visit, i) => ({
    start: { lat: sorted[i].lat, lng: sorted[i].lng, label: sorted[i].placeName },
    end: { lat: visit.lat, lng: visit.lng, label: visit.placeName },
  }));
  const hotspots = sorted.filter(isExplored).map((v) => ({ lat: v.lat, lng: v.lng, label: v.placeName }));

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        title="Map"
        actions={
          <Button size="sm" onClick={() => setDrawerOpen(true)} disabled={!profile}>
            Log a visit
          </Button>
        }
      />
      <div className="p-4 flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="w-full aspect-[2/1] rounded-lg" />
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No visits logged yet. Tap &quot;Log a visit&quot; to add your first one.
            </CardContent>
          </Card>
        ) : (
          <WorldMap dots={dots} hotspots={hotspots} />
        )}
        <div className="flex flex-col gap-2">
          {sorted.slice().reverse().map((visit) => (
            <Card key={visit.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{visit.placeName}, {visit.country}</p>
                  <p className="text-xs text-muted-foreground">
                    {visit.arrivalDate}{visit.departureDate ? ` – ${visit.departureDate}` : ''}
                    {isExplored(visit) ? ' · Explored' : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {profile && (
        <LogVisitDrawer
          profileId={profile.id}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onSaved={() => mutate()}
        />
      )}
      <TravelLogBottomNav />
    </div>
  );
}
