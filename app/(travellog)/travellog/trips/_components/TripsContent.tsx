'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { tripsQuery, type TripSummary } from '@/lib/travellog/queries';

export function TripsContent() {
  const { data, isLoading } = useSWR<{ plans: TripSummary[] }>(tripsQuery().key, tripsQuery().fetcher);

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="My Trips" />
      <div className="p-4 flex flex-col gap-3">
        {isLoading && (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </>
        )}
        {!isLoading && (data?.plans.length ?? 0) === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground text-center">
              No trips yet. Plan one from the Plan tab.
            </CardContent>
          </Card>
        )}
        {(data?.plans ?? []).map((trip) => (
          <Link
            key={trip.id}
            href={`/travellog/trips/${trip.id}`}
            className="block rounded-2xl transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{trip.destination}</p>
                  <p className="text-xs text-muted-foreground">{trip.startDate} – {trip.endDate}</p>
                </div>
                {trip.myRole === 'owner' && <Badge variant="secondary">Owner</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
