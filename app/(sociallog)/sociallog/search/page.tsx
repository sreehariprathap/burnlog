// app/(sociallog)/sociallog/search/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SocialLogSearchPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Search" />
      <main className="flex-1 container mx-auto p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Search is coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Find users, topics, and reels here.
            </p>
          </CardContent>
        </Card>
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
