'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import WorldMap from '@/components/ui/world-map';
import { PassportStamp } from '@/components/travellog/PassportStamp';
import { countryViewBox } from '@/lib/travellog/countryViewBox';
import { isExplored, type TravelVisitRow } from '@/lib/travellog/types';
import { visitsQuery } from '@/lib/travellog/queries';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** The passport's inside cover: who it belongs to, and the totals so far. */
function CoverPage({
  holder,
  issued,
  visits,
  countries,
  explored,
}: {
  holder: string;
  issued: string | null;
  visits: number;
  countries: number;
  explored: number;
}) {
  return (
    <Card className="min-h-[420px] border-primary/30">
      <CardContent className="flex h-full flex-col justify-between gap-6 py-6">
        <div className="space-y-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Travel Passport
          </p>
          <div className="mx-auto h-px w-16 bg-primary/40" />
        </div>

        <div className="space-y-4 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Holder</p>
            <p className="text-xl font-semibold">{holder}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Issued</p>
            <p className="text-sm">{issued ? formatDate(issued) : '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-primary/20 pt-4 text-center">
          <div>
            <p className="text-2xl font-bold tabular-nums">{visits}</p>
            <p className="text-xs text-muted-foreground">Visits</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{countries}</p>
            <p className="text-xs text-muted-foreground">Countries</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{explored}</p>
            <p className="text-xs text-muted-foreground">Explored</p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Swipe to turn the page →</p>
      </CardContent>
    </Card>
  );
}

/** One country's page — its cropped map washed into the background, its
 * visits stamped on top. */
function CountryPage({
  country,
  visits,
  onSelect,
}: {
  country: string;
  visits: TravelVisitRow[];
  onSelect: (visit: TravelVisitRow) => void;
}) {
  const viewBox = useMemo(
    () => countryViewBox(visits.map((v) => ({ lat: v.lat, lng: v.lng }))),
    [visits]
  );

  return (
    <Card className="relative min-h-[420px] overflow-hidden border-primary/30">
      {/* The country's own map, faded back so it reads as page texture
       * rather than competing with the stamps sitting on it. */}
      <div className="pointer-events-none absolute inset-0 flex items-center opacity-[0.12]">
        <WorldMap
          hotspots={visits.map((v) => ({ lat: v.lat, lng: v.lng, label: v.placeName }))}
          viewBox={viewBox}
          className="rounded-none border-none bg-transparent"
        />
      </div>

      <CardContent className="relative flex h-full flex-col gap-4 py-6">
        <div className="flex items-baseline justify-between border-b border-primary/20 pb-2">
          <h2 className="text-lg font-semibold uppercase tracking-wide">{country}</h2>
          <span className="text-xs text-muted-foreground">
            {visits.length} {visits.length === 1 ? 'stamp' : 'stamps'}
          </span>
        </div>

        {/* A loose grid, with each stamp jittered inside its own cell — keeps
         * the hand-pressed look without letting stamps pile up illegibly. */}
        <div className="grid grid-cols-3 gap-3">
          {visits.map((visit) => (
            <PassportStamp key={visit.id} visit={visit} onClick={() => onSelect(visit)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeContent() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const { data: visits, isLoading } = useSWR(
    profile ? visitsQuery(profile.id).key : null,
    profile ? visitsQuery(profile.id).fetcher : null
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<TravelVisitRow | null>(null);

  const loading = profileLoading || isLoading;
  const sorted = useMemo(() => visits ?? [], [visits]);

  // Visits arrive sorted by arrivalDate, so inserting into a Map in that
  // order gives country pages in first-visited order — a passport fills up
  // chronologically, not alphabetically.
  const byCountry = useMemo(() => {
    const map = new Map<string, TravelVisitRow[]>();
    for (const visit of sorted) {
      const list = map.get(visit.country) ?? [];
      list.push(visit);
      map.set(visit.country, list);
    }
    return [...map.entries()];
  }, [sorted]);

  const holder =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    profile?.username ||
    'Traveller';

  const slides = useMemo(
    () => [
      <CoverPage
        key="cover"
        holder={holder}
        issued={sorted[0]?.arrivalDate ?? null}
        visits={sorted.length}
        countries={byCountry.length}
        explored={sorted.filter(isExplored).length}
      />,
      ...byCountry.map(([country, countryVisits]) => (
        <CountryPage
          key={country}
          country={country}
          visits={countryVisits}
          onSelect={setSelected}
        />
      )),
    ],
    [holder, sorted, byCountry]
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="TravelLog" />
      <div className="flex flex-col gap-2 p-4">
        {loading ? (
          <Skeleton className="h-[420px] w-full rounded-2xl" />
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Your passport is empty. Head to the Map tab to stamp your first visit.
            </CardContent>
          </Card>
        ) : (
          <>
            <MotionCarousel slides={slides} selectedIndex={page} onSelect={setPage} />
            <p className="text-center text-xs text-muted-foreground">
              Page {page + 1} of {slides.length}
            </p>
          </>
        )}
      </div>

      <Drawer open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {selected?.placeName}, {selected?.country}
            </DrawerTitle>
          </DrawerHeader>
          {selected && (
            <div className="space-y-3 px-4 pb-8 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Arrived</span>
                <span>{formatDate(selected.arrivalDate)}</span>
              </div>
              {selected.departureDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Departed</span>
                  <span>{formatDate(selected.departureDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span>{selected.travelMode === 'road_trip' ? 'Road trip' : 'Flight'}</span>
              </div>
              {isExplored(selected) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stay</span>
                  <span>Explored (multi-day)</span>
                </div>
              )}
              {selected.notes && (
                <div className="space-y-1 border-t pt-3">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
