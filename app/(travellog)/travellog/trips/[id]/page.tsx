// app/(travellog)/travellog/trips/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ItineraryReview } from '../../plan/_components/ItineraryReview';
import { InviteMemberForm } from './_components/InviteMemberForm';
import { apiFetch } from '@/lib/apiFetch';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';

interface TripMember {
  role: string;
  joinedAt: string;
  profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
}

interface TripVisit {
  id: string;
  profileId: string;
  placeName: string;
  country: string;
  arrivalDate: string;
  departureDate: string | null;
}

interface TripDetail {
  plan: {
    id: string;
    destination: string;
    hotel: string | null;
    startDate: string;
    endDate: string;
    numPeople: number;
    transportMode: string;
    budget: number | null;
    budgetCurrency: string;
    itinerary: Itinerary;
  };
  myRole: 'owner' | 'member';
  members: TripMember[];
  visits: TripVisit[];
}

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trip');
  return res.json();
}

const visitDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function formatVisitDate(date: string): string {
  return visitDateFormatter.format(new Date(date));
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, mutate } = useSWR<TripDetail>(`/api/travellog/plans/${params.id}`, fetcher);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen pb-24 p-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  const req: ItineraryRequest = {
    destination: data.plan.destination,
    hotel: data.plan.hotel ?? '',
    startDate: data.plan.startDate,
    endDate: data.plan.endDate,
    numPeople: data.plan.numPeople,
    transportMode: data.plan.transportMode as ItineraryRequest['transportMode'],
    budget: data.plan.budget,
    budgetCurrency: data.plan.budgetCurrency,
  };

  return (
    <div className="min-h-screen pb-24">
      <TopBar title={data.plan.destination} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Trip members</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.members.map((m) => (
              <div key={m.profile?.id} className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  {m.profile?.avatarUrl && <AvatarImage src={m.profile.avatarUrl} alt={m.profile.username} />}
                  <AvatarFallback>{m.profile?.firstName?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <p className="text-sm">@{m.profile?.username}</p>
                {m.role === 'owner' && <Badge variant="secondary">Owner</Badge>}
              </div>
            ))}
            {data.myRole === 'owner' && (
              <div className="pt-2 border-t mt-2">
                <InviteMemberForm planId={data.plan.id} onInvited={() => mutate()} />
              </div>
            )}
          </CardContent>
        </Card>

        <ItineraryReview req={req} itinerary={data.plan.itinerary} />

        <Card>
          <CardHeader><CardTitle>Trip visit log</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.visits.length === 0 && <p className="text-sm text-muted-foreground">No visits logged for this trip yet.</p>}
            {data.visits.map((v) => (
              <div key={v.id} className="text-sm">
                <p className="font-medium">{v.placeName}, {v.country}</p>
                <p className="text-xs text-muted-foreground">{formatVisitDate(v.arrivalDate)}{v.departureDate ? ` – ${formatVisitDate(v.departureDate)}` : ''}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
