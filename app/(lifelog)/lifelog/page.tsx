// app/(lifelog)/lifelog/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { LifeLogBottomNav } from '@/components/LifeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LifeLogHomePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar title="LifeLog" />
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle>LifeLog is coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Expense tracking, budgeting, and grocery planning will land here.
            </p>
          </CardContent>
        </Card>
      </div>
      <LifeLogBottomNav />
    </div>
  );
}
