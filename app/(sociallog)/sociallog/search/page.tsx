// app/(sociallog)/sociallog/search/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useState } from 'react';
import Link from 'next/link';
import { TrophyIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserResults } from './_components/UserResults';
import { TopicResults } from './_components/TopicResults';
import { ReelsGrid } from './_components/ReelsGrid';

export default function SocialLogSearchPage() {
  const [tab, setTab] = useState<'users' | 'topics' | 'reels'>('users');
  const [query, setQuery] = useState('');

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Search"
        actions={
          <Link href="/sociallog/leaderboard" aria-label="Life Score leaderboard">
            <TrophyIcon className="h-5 w-5" />
          </Link>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
            <TabsTrigger value="topics" className="flex-1">Topics</TabsTrigger>
            <TabsTrigger value="reels" className="flex-1">Reels</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab !== 'reels' && (
          <>
            <Label htmlFor="social-search" className="sr-only">
              {tab === 'users' ? 'Search by username' : 'Search topics'}
            </Label>
            <Input
              id="social-search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'users' ? 'Search by username…' : 'Search topics…'}
            />
          </>
        )}

        {tab === 'users' && <UserResults query={query} />}
        {tab === 'topics' && <TopicResults query={query} />}
        {tab === 'reels' && <ReelsGrid />}
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
