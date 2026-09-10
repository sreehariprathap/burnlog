// app/(travellog)/travellog/plan/_components/TripPlannerFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';
import { acceptTravelPlan } from '@/lib/travellog/acceptPlan';
import { TripIntakeForm } from './TripIntakeForm';
import { ItineraryReview } from './ItineraryReview';
import { InviteMemberForm } from '../../trips/[id]/_components/InviteMemberForm';

interface TripPlannerFlowProps {
  initial?: Partial<ItineraryRequest>;
  /** Called once the user is done with the post-accept share step — e.g. to close a host drawer. */
  onAccepted?: () => void;
}

/**
 * The intake → AI itinerary → accept → share sequence, shared by the Plan
 * tab (full page) and the passport page's "Log a trip" FAB (bottom drawer) —
 * pulled out of PlanContent so both entry points stay behaviorally identical.
 */
export function TripPlannerFlow({ initial, onAccepted }: TripPlannerFlowProps) {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [generated, setGenerated] = useState<{ req: ItineraryRequest; itinerary: Itinerary } | null>(null);
  const [accepted, setAccepted] = useState<{ planId: string; destination: string } | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function handleAccept(finalItinerary: Itinerary) {
    if (!generated || !profile) return;
    setAccepting(true);
    try {
      const { tasksCreated, planId } = await acceptTravelPlan(supabase, profile.id, generated.req, finalItinerary);
      toast({ description: `Trip saved — ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} created.` });
      setAccepted({ planId, destination: generated.req.destination });
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

  function handleDone() {
    router.push('/travellog?tab=trips');
    onAccepted?.();
  }

  if (accepted) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Trip to {accepted.destination} saved
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Share it with anyone joining you.</p>
            <InviteMemberForm planId={accepted.planId} onInvited={() => {}} />
          </CardContent>
        </Card>
        <Button type="button" className="w-full" onClick={handleDone}>
          Done
        </Button>
      </div>
    );
  }

  if (!generated) {
    return <TripIntakeForm initial={initial} onGenerated={(req, itinerary) => setGenerated({ req, itinerary })} />;
  }

  return (
    <ItineraryReview
      req={generated.req}
      itinerary={generated.itinerary}
      onAccept={handleAccept}
      onStartOver={() => setGenerated(null)}
      accepting={accepting}
    />
  );
}
