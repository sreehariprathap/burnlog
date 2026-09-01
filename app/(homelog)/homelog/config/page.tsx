'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';

export default function HomeLogConfigPage() {
  return (
    <AppConfigShell
      appName="HomeLog"
      onboardingHref="/homelog/onboarding?returnTo=/homelog/config"
      exportData={() => ({})}
      bottomNav={<HomeLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>HomeLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No HomeLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
