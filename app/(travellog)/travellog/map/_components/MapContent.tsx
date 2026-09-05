'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';
import { visitsQuery } from '@/lib/travellog/queries';
import { LogVisitDrawer } from './LogVisitDrawer';
import WorldMap, { projectPoint, type MapPoint } from '@/components/ui/world-map';

const COUNTRY_MAP_PADDING_DEG = 5;

function countryViewBox(points: MapPoint[]): string {
  const projected = points.map((p) => projectPoint(p.lat, p.lng));
  const padX = (COUNTRY_MAP_PADDING_DEG / 360) * 800;
  const padY = (COUNTRY_MAP_PADDING_DEG / 180) * 400;
  const minX = Math.max(0, Math.min(...projected.map((p) => p.x)) - padX);
  const maxX = Math.min(800, Math.max(...projected.map((p) => p.x)) + padX);
  const minY = Math.max(0, Math.min(...projected.map((p) => p.y)) - padY);
  const maxY = Math.min(400, Math.max(...projected.map((p) => p.y)) + padY);
  // Keep the 2:1 aspect ratio the map is rendered at, otherwise the crop
  // looks stretched — widen whichever axis is too narrow for it. The floor
  // keeps a single-city country (a zero-size bounding box) from cropping
  // down to a comically zoomed-in dot with oversized text.
  const w = Math.max(maxX - minX, 60);
  const h = Math.max(maxY - minY, 30);
  const aspect = 2;
  if (w / h > aspect) {
    const targetH = w / aspect;
    const cy = (minY + maxY) / 2;
    return `${minX} ${cy - targetH / 2} ${w} ${targetH}`;
  }
  const targetW = h * aspect;
  const cx = (minX + maxX) / 2;
  return `${cx - targetW / 2} ${minY} ${targetW} ${h}`;
}

export function MapContent() {
  const { profile } = useCurrentProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapPoint | null>(null);
  const { data: visits, isLoading, mutate } = useSWR(
    profile ? visitsQuery(profile.id).key : null,
    profile ? visitsQuery(profile.id).fetcher : null
  );

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'You are here' }),
      () => {
        // Permission denied/unavailable — the map just renders without a
        // "you are here" marker, no error surfaced.
      },
      { maximumAge: 5 * 60_000, timeout: 8_000 }
    );
  }, []);

  const sorted: TravelVisitRow[] = useMemo(() => visits ?? [], [visits]);
  const flights = sorted.filter((v) => v.travelMode !== 'road_trip');
  const roadTrips = sorted.filter((v) => v.travelMode === 'road_trip');

  // Flights form the chronological chain of where you actually lived/flew
  // to. A lone flight has no pair to connect to — render it as a self-loop
  // dot so it still shows up on the map.
  const dots =
    flights.length === 1
      ? [{ start: { lat: flights[0].lat, lng: flights[0].lng, label: flights[0].placeName }, end: { lat: flights[0].lat, lng: flights[0].lng, label: flights[0].placeName } }]
      : flights.slice(1).map((visit, i) => ({
          start: { lat: flights[i].lat, lng: flights[i].lng, label: flights[i].placeName },
          end: { lat: visit.lat, lng: visit.lng, label: visit.placeName },
        }));

  // Each road trip is a spoke from whichever flight visit was "home" at the
  // time (the most recent flight with an arrival on or before this trip),
  // not a chain between road-trip destinations themselves.
  const roadDots = roadTrips
    .map((trip) => {
      const base = [...flights].reverse().find((f) => f.arrivalDate <= trip.arrivalDate);
      if (!base) return null;
      return {
        start: { lat: base.lat, lng: base.lng, label: base.placeName },
        end: { lat: trip.lat, lng: trip.lng, label: trip.placeName },
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const hotspots = sorted.filter(isExplored).map((v) => ({ lat: v.lat, lng: v.lng, label: v.placeName }));

  const byCountry = useMemo(() => {
    const map = new Map<string, TravelVisitRow[]>();
    for (const v of sorted) {
      const list = map.get(v.country) ?? [];
      list.push(v);
      map.set(v.country, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sorted]);

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
          <>
            <WorldMap
              dots={dots}
              roadDots={roadDots}
              hotspots={hotspots}
              currentLocation={currentLocation ?? undefined}
              interactive
              className="rounded-none"
            />
            <p className="px-4 text-xs text-muted-foreground">
              Scroll or pinch to zoom, drag to pan, double-click/tap to reset. Solid line = flights, dashed = road trips.
            </p>

            {byCountry.length > 1 && (
              <div className="flex flex-col gap-2 px-4">
                <h2 className="text-sm font-semibold">By country</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {byCountry.map(([country, countryVisits]) => (
                    <div key={country} className="flex flex-col gap-1">
                      <WorldMap
                        dots={dots.filter((d) => countryVisits.some((v) => v.placeName === d.start.label) && countryVisits.some((v) => v.placeName === d.end.label))}
                        roadDots={roadDots.filter((d) => countryVisits.some((v) => v.placeName === d.start.label) || countryVisits.some((v) => v.placeName === d.end.label))}
                        hotspots={countryVisits.filter(isExplored).map((v) => ({ lat: v.lat, lng: v.lng, label: v.placeName }))}
                        viewBox={countryViewBox(countryVisits.map((v) => ({ lat: v.lat, lng: v.lng })))}
                        className="rounded-lg"
                      />
                      <p className="text-center text-xs text-muted-foreground">{country}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-1 gap-2 px-4 sm:grid-cols-2">
          {sorted.slice().reverse().map((visit) => (
            <Card key={visit.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{visit.placeName}, {visit.country}</p>
                  <p className="text-xs text-muted-foreground">
                    {visit.arrivalDate}{visit.departureDate ? ` – ${visit.departureDate}` : ''}
                    {' · '}{visit.travelMode === 'road_trip' ? 'Road trip' : 'Flight'}
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
