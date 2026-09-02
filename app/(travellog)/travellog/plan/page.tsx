'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';
import { acceptTravelPlan } from '@/lib/travellog/acceptPlan';
import { TripIntakeForm } from './_components/TripIntakeForm';
import { ItineraryReview } from './_components/ItineraryReview';
import { TripInvitesBanner } from './_components/TripInvitesBanner';

function PlanPageInner() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const initial: Partial<ItineraryRequest> | undefined = searchParams.get('destination')
    ? {
        destination: searchParams.get('destination') ?? undefined,
        startDate: searchParams.get('startDate') ?? undefined,
        endDate: searchParams.get('endDate') ?? undefined,
        budget: searchParams.get('budget') ? Number(searchParams.get('budget')) : null,
        budgetCurrency: searchParams.get('budgetCurrency') ?? undefined,
      }
    : undefined;

  const [generated, setGenerated] = useState<{ req: ItineraryRequest; itinerary: Itinerary } | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    if (!generated || !profile) return;
    setAccepting(true);
    try {
      const { tasksCreated } = await acceptTravelPlan(supabase, profile.id, generated.req, generated.itinerary);
      toast({ description: `Trip saved — ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} created.` });
      router.push('/travellog/map');
    } catch (err) {
      toast({
        title: 'Could not save trip plan',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Plan" />
      <div className="px-4 pt-4">
        <TripInvitesBanner />
      </div>
      <div className="p-4">
        {!generated ? (
          <TripIntakeForm initial={initial} onGenerated={(req, itinerary) => setGenerated({ req, itinerary })} />
        ) : (
          <ItineraryReview
            req={generated.req}
            itinerary={generated.itinerary}
            onAccept={handleAccept}
            onStartOver={() => setGenerated(null)}
            accepting={accepting}
          />
        )}
      </div>
      <TravelLogBottomNav />
    </div>
  );
}

export default function TravelLogPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <PlanPageInner />
    </Suspense>
  );
}
