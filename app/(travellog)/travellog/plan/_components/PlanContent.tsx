'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import type { ItineraryRequest } from '@/lib/travellog/itinerary';
import { TripPlannerFlow } from './TripPlannerFlow';
import { TripInvitesBanner } from './TripInvitesBanner';

function PlanContentInner() {
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

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Plan" />
      <div className="px-4 pt-4">
        <TripInvitesBanner />
      </div>
      <div className="p-4">
        <TripPlannerFlow initial={initial} />
      </div>
    </div>
  );
}

export function PlanContent() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <PlanContentInner />
    </Suspense>
  );
}
