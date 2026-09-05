'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored } from '@/lib/travellog/types';
import { visitsQuery } from '@/lib/travellog/queries';
import { LogVisitDrawer } from './LogVisitDrawer';
import WorldMap from '@/components/ui/world-map';

export function MapContent() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? visitsQuery(profile.id).key : null,
    profile ? visitsQuery(profile.id).fetcher : null
  );

  const sorted = visits ?? [];
  // A lone visit has no pair to connect to — render it as a self-loop dot so it
  // still shows up on the map, matching every other visit which gets a start/end pair.
  const dots =
    sorted.length === 1
      ? [{ start: { lat: sorted[0].lat, lng: sorted[0].lng, label: sorted[0].placeName }, end: { lat: sorted[0].lat, lng: sorted[0].lng, label: sorted[0].placeName } }]
      : sorted.slice(1).map((visit, i) => ({
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
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="w-full aspect-[2/1] rounded-none" />
        ) : sorted.length === 0 ? (
          <Card className="mx-4">
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No visits logged yet. Tap &quot;Log a visit&quot; to add your first one.
            </CardContent>
          </Card>
        ) : (
          <WorldMap dots={dots} hotspots={hotspots} className="rounded-none" />
        )}
        <div className="flex flex-col gap-2 px-4">
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
    </div>
  );
}
