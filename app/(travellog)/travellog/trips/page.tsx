// app/(travellog)/travellog/trips/page.tsx
'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/apiFetch';

interface TripSummary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  myRole: 'owner' | 'member';
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trips');
  return res.json();
}

export default function TravelLogTripsPage() {
  const { data, isLoading } = useSWR<{ plans: TripSummary[] }>('/api/travellog/plans', fetcher);

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
          <Link key={trip.id} href={`/travellog/trips/${trip.id}`}>
            <Card>
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
      <TravelLogBottomNav />
    </div>
  );
}
