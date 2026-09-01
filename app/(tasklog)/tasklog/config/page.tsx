'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { TaskLogBottomNav } from '@/components/TaskLogBottomNav';

export default function TaskLogConfigPage() {
  return (
    <AppConfigShell
      appName="TaskLog"
      onboardingHref="/tasklog/onboarding?returnTo=/tasklog/config"
      exportData={() => ({})}
      bottomNav={<TaskLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>TaskLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No TaskLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
