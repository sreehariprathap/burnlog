// app/(travellog)/travellog/suggestions/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';
import { Card, CardContent } from '@/components/ui/card';

export default function TravelLogSuggestionsPage() {
  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Suggestions" />
      <div className="p-4">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            Affordable trip suggestions are coming soon.
          </CardContent>
        </Card>
      </div>
      <TravelLogBottomNav />
    </div>
  );
}
