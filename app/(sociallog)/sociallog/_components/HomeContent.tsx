'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { ComposeBox } from './ComposeBox';
import { FollowRequestsBanner } from './FollowRequestsBanner';
import { FeedControls } from './FeedControls';
import { PostCard, type FeedPost } from './PostCard';
import { Loader2, RefreshCw, Sparkles, Users, FileText, Clapperboard } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { StatCard } from '@/components/ui/stat-card';
import { statsQuery } from '@/lib/sociallog/queries';
import { PostReelViewer } from '@/components/sociallog/PostReelViewer';

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export function HomeContent() {
  const { profile } = useCurrentProfile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'following' ? 'following' : 'foryou';
  const sortParam = searchParams.get('sort');
  const sort = sortParam === 'new' || sortParam === 'top' ? sortParam : 'hot';

  function setTab(next: 'foryou' | 'following') {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setSort(next: 'hot' | 'new' | 'top') {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const { data, isLoading, mutate } = useSWR<{ posts: FeedPost[] }>(
    `/api/sociallog/posts?tab=${tab}&sort=${sort}`,
    fetcher
  );
  const { data: stats } = useSWR<{ followers: number; posts: number }>(
    profile ? statsQuery().key : null,
    profile ? statsQuery().fetcher : null
  );
  const [reelIndex, setReelIndex] = useState<number | null>(null);
  const mediaPosts = (data?.posts ?? []).filter((p) => p.mediaUrl && (p.mediaType === 'image' || p.mediaType === 'video'));

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="SocialLog"
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={() => mutate()}>
            <RefreshCw className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <ComposeBox onPosted={() => mutate()} />
        <FollowRequestsBanner />
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Followers" icon={Users}>
            <p className="text-2xl font-bold">{stats?.followers ?? 0}</p>
          </StatCard>
          <StatCard title="Posts" icon={FileText}>
            <p className="text-2xl font-bold">{stats?.posts ?? 0}</p>
          </StatCard>
        </div>
        {mediaPosts.length > 0 && (
          <Button variant="outline" className="w-full gap-2" onClick={() => setReelIndex(0)}>
            <Clapperboard className="size-4" />
            View as Reels
          </Button>
        )}
        <FeedControls tab={tab} sort={sort} onTabChange={setTab} onSortChange={setSort} />
        {isLoading && (
          <div role="status">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="sr-only">Loading…</span>
          </div>
        )}
        {!isLoading && (data?.posts.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {tab === 'following' ? 'Nobody you follow has posted yet' : 'No posts yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {tab === 'following' ? 'Follow more people or switch to For You.' : 'Be the first to share something.'}
            </p>
          </div>
        )}
        {(data?.posts ?? []).map((post) => (
          <PostCard key={post.id} post={post} currentProfileId={profile?.id ?? null} />
        ))}
      </main>
      {reelIndex !== null && (
        <PostReelViewer posts={mediaPosts} initialIndex={reelIndex} onClose={() => setReelIndex(null)} />
      )}
    </div>
  );
}
