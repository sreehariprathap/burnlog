// app/(travellog)/travellog/plan/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';
import { acceptTravelPlan } from '@/lib/travellog/acceptPlan';
import { TripIntakeForm } from './_components/TripIntakeForm';
import { ItineraryReview } from './_components/ItineraryReview';

export default function TravelLogPlanPage() {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

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
      <div className="p-4">
        {!generated ? (
          <TripIntakeForm onGenerated={(req, itinerary) => setGenerated({ req, itinerary })} />
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
