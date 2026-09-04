'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrophyIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserResults } from './UserResults';
import { TopicResults } from './TopicResults';
import { ReelsGrid } from './ReelsGrid';

export function SearchContent() {
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
    </div>
  );
}
