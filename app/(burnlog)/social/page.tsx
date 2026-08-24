'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { FriendSearch } from './_components/FriendSearch';
import { FriendRequests } from './_components/FriendRequests';

export default function SocialPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Social" />
      <main className="flex-1 container mx-auto p-4 pb-24 space-y-4">
        <FriendRequests refreshKey={refreshKey} onChanged={bump} />
        <FriendSearch onRequestSent={bump} />
      </main>
      <BottomNav />
    </div>
  );
}
