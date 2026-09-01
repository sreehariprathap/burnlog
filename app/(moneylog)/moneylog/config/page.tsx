'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { MoneyLogBottomNav } from '@/components/MoneyLogBottomNav';

export default function MoneyLogConfigPage() {
  return (
    <AppConfigShell
      appName="MoneyLog"
      onboardingHref="/moneylog/onboarding"
      exportData={() => ({})}
      bottomNav={<MoneyLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>MoneyLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No MoneyLog-specific settings yet. Use Reonboard to redo your budget setup.
          </p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
