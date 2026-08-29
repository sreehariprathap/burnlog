// app/(sociallog)/sociallog/messages/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SocialLogMessagesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Messages" />
      <main className="flex-1 container mx-auto p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Messages are coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your direct message threads will show up here.
            </p>
          </CardContent>
        </Card>
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
