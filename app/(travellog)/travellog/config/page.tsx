// app/(travellog)/travellog/config/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TravelLogBottomNav } from '@/components/TravelLogBottomNav';

export default function TravelLogConfigPage() {
  return (
    <AppConfigShell
      appName="TravelLog"
      exportData={() => ({})}
      bottomNav={<TravelLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TravelLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No TravelLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
