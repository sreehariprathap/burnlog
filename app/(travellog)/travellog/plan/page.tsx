// app/(travellog)/travellog/plan/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';

export default function TravelLogPlanPage() {
  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Plan" />
      <div className="p-4">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            AI-assisted trip planning (IceMyVacation) is coming soon.
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
