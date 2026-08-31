'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AppConfigShell } from '@/components/AppConfigShell';
import { ShoppingLogBottomNav } from '@/components/ShoppingLogBottomNav';

export default function ShoppingLogConfigPage() {
  return (
    <AppConfigShell
      appName="ShoppingLog"
      exportData={() => ({})}
      bottomNav={<ShoppingLogBottomNav />}
    >
      <Card>
        <CardHeader><CardTitle>ShoppingLog settings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No ShoppingLog-specific settings yet.</p>
        </CardContent>
      </Card>
    </AppConfigShell>
  );
}
