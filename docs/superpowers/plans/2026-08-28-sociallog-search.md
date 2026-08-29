# SocialLog Search (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SocialLog Search placeholder with a working Users / Topics / Reels search, add photo/video attachment to the Dashboard's compose box (so people can actually create reel content), and seed a couple of demo photo posts so Reels isn't empty on first look.

**Architecture:** Three new read-only search API routes under `app/api/sociallog/search/` (users, topics, reels), each following the exact auth shape established in Phase 2 (`createRouteHandlerClient` for the session, `createServiceRoleClient` for reads). The Search page is a client component with a segmented control (shadcn `Tabs`) switching between three result views, each debouncing its own query input. Reels use a responsive CSS grid (Instagram-style) and a lightweight, dependency-free full-screen viewer (Dialog + prev/next state + touch-swipe handlers) rather than pulling in `embla-carousel` for one screen. Media upload reuses the exact `ProfileAvatar.tsx` pattern (list existing → remove stale → upload → `getPublicUrl`) against the `sociallog-media` bucket created in Foundation. Per the approved brainstorming decision, Reels = both photo and video posts (not video-only) — matching Instagram's actual behavior.

**Tech Stack:** Same as Phases 1-2 — Next.js 15 App Router, React 19, TypeScript, `@supabase/supabase-js`, SWR, shadcn/ui, lucide-react.

## Global Constraints

- No automated test suite. Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual checks against `npm run dev` / seeded data.
- Every new API route follows the exact auth shape used throughout `app/api/sociallog/*`: `createRouteHandlerClient({ cookies }).auth.getUser()` for the session, then `createServiceRoleClient()` for reads.
- Do not touch `(burnlog)`, `(lifelog)`, `(homelog)`, `(tasklog)`, or `app/api/social/*`.
- Media upload client-side caps: images ≤ 10 MB (matching `ProfileAvatar.tsx`'s existing cap), videos ≤ 25 MB — enforced in the upload component, not the API (no server-side transcoding, per the design spec's explicit non-goal).

---

### Task 1: Search users API

**Files:**
- Create: `app/api/sociallog/search/users/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/search/users?q=<query>` → `{ results: { id, username, firstName, avatarUrl, isFollowing }[] }` (empty array for `q` shorter than 2 chars, matching the existing `app/api/social/search` convention). Consumed by Task 4's `UserResults`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/search/users/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: matches } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .ilike('username', `${q}%`)
      .neq('id', me.id)
      .limit(20);

    const matchIds = (matches ?? []).map((m) => m.id);
    const { data: followRows } = await admin
      .from('social_follows')
      .select('followingId')
      .eq('followerId', me.id)
      .in('followingId', matchIds.length ? matchIds : ['00000000-0000-0000-0000-000000000000']);
    const followingIds = new Set((followRows ?? []).map((r) => r.followingId as string));

    const results = (matches ?? []).map((m) => ({
      id: m.id,
      username: m.username,
      firstName: m.firstName,
      avatarUrl: m.avatarUrl,
      isFollowing: followingIds.has(m.id),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('sociallog search users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/sociallog/search/users/route.ts
git commit -m "feat(sociallog): add search users API"
```

---

### Task 2: Search topics API

**Files:**
- Create: `app/api/sociallog/search/topics/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/search/topics?q=<query>` → `{ results: { name: string, postCount: number }[] }`. Empty-string `q` returns the top topics by post count (so the Topics tab isn't blank before the user types). Consumed by Task 4's `TopicResults`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/search/topics/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();

    const admin = createServiceRoleClient();
    let topicsQuery = admin.from('social_topics').select('id, name').limit(30);
    if (q.length > 0) {
      topicsQuery = topicsQuery.ilike('name', `${q}%`);
    }
    const { data: topics } = await topicsQuery;

    const topicIds = (topics ?? []).map((t) => t.id);
    const { data: links } = await admin
      .from('social_post_topics')
      .select('topicId')
      .in('topicId', topicIds.length ? topicIds : ['00000000-0000-0000-0000-000000000000']);

    const countByTopic = new Map<string, number>();
    for (const l of links ?? []) {
      countByTopic.set(l.topicId, (countByTopic.get(l.topicId) ?? 0) + 1);
    }

    const results = (topics ?? [])
      .map((t) => ({ name: t.name, postCount: countByTopic.get(t.id) ?? 0 }))
      .sort((a, b) => b.postCount - a.postCount);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('sociallog search topics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/sociallog/search/topics/route.ts
git commit -m "feat(sociallog): add search topics API"
```

---

### Task 3: Reels API

**Files:**
- Create: `app/api/sociallog/search/reels/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/search/reels` → `{ reels: { id, mediaType, mediaUrl, mediaThumbnailUrl, body, createdAt, author: { id, username, firstName, avatarUrl } }[] }`, most recent `MEDIA`-kind posts first (capped at 60). Consumed by Task 4's `ReelsGrid`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/search/reels/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from('social_posts')
      .select('id, mediaType, mediaUrl, mediaThumbnailUrl, body, createdAt, profile:profiles(id, username, firstName, avatarUrl)')
      .eq('kind', 'MEDIA')
      .order('createdAt', { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      id: string;
      mediaType: string | null;
      mediaUrl: string | null;
      mediaThumbnailUrl: string | null;
      body: string | null;
      createdAt: string;
      profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    const reels = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.profile !== null && r.mediaUrl !== null)
      .map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        mediaUrl: r.mediaUrl,
        mediaThumbnailUrl: r.mediaThumbnailUrl,
        body: r.body,
        createdAt: r.createdAt,
        author: r.profile,
      }));

    return NextResponse.json({ reels });
  } catch (error) {
    console.error('sociallog search reels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/sociallog/search/reels/route.ts
git commit -m "feat(sociallog): add reels API"
```

---

### Task 4: Search page UI

**Files:**
- Create: `app/(sociallog)/sociallog/search/_components/UserResults.tsx`
- Create: `app/(sociallog)/sociallog/search/_components/TopicResults.tsx`
- Create: `app/(sociallog)/sociallog/search/_components/ReelsGrid.tsx`
- Create: `app/(sociallog)/sociallog/search/_components/ReelViewer.tsx`
- Modify: `app/(sociallog)/sociallog/search/page.tsx` (replace the placeholder body)

**Interfaces:**
- Consumes: `GET /api/sociallog/search/users`, `GET /api/sociallog/search/topics`, `GET /api/sociallog/search/reels`, `POST /api/sociallog/follow`, `DELETE /api/sociallog/follow/:id` (from Phase 2).
- Produces: `<UserResults query={string} />`, `<TopicResults query={string} onSelectTopic={(name) => void} />`, `<ReelsGrid />`, `<ReelViewer reels={Reel[]} startIndex={number} onClose={() => void} />` — all consumed only by `app/(sociallog)/sociallog/search/page.tsx` in this task.

- [ ] **Step 1: Create `UserResults.tsx`**

```tsx
// app/(sociallog)/sociallog/search/_components/UserResults.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type UserResult = { id: string; username: string; firstName: string; avatarUrl: string | null; isFollowing: boolean };

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

function FollowButton({ userId, initialFollowing }: { userId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    if (following) {
      await fetch(`/api/sociallog/follow/${userId}`, { method: 'DELETE' });
      setFollowing(false);
    } else {
      await fetch('/api/sociallog/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: userId }),
      });
      setFollowing(true);
    }
    setBusy(false);
  };

  return (
    <Button variant={following ? 'outline' : 'default'} size="sm" onClick={toggle} disabled={busy}>
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}

export function UserResults({ query }: { query: string }) {
  const { data, isLoading } = useSWR<{ results: UserResult[] }>(
    `/api/sociallog/search/users?q=${encodeURIComponent(query)}`,
    fetcher
  );

  if (query.trim().length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search users.</p>;
  }
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if ((data?.results.length ?? 0) === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>;
  }

  return (
    <div className="space-y-2">
      {data!.results.map((u) => (
        <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Avatar>
              {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
              <AvatarFallback>{u.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">@{u.username}</p>
              <p className="text-xs text-muted-foreground">{u.firstName}</p>
            </div>
          </div>
          <FollowButton userId={u.id} initialFollowing={u.isFollowing} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `TopicResults.tsx`**

```tsx
// app/(sociallog)/sociallog/search/_components/TopicResults.tsx
'use client';

import useSWR from 'swr';
import { Loader2, Hash } from 'lucide-react';

type TopicResult = { name: string; postCount: number };

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export function TopicResults({ query }: { query: string }) {
  const { data, isLoading } = useSWR<{ results: TopicResult[] }>(
    `/api/sociallog/search/topics?q=${encodeURIComponent(query)}`,
    fetcher
  );

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if ((data?.results.length ?? 0) === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No topics found.</p>;
  }

  return (
    <div className="space-y-2">
      {data!.results.map((t) => (
        <div key={t.name} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t.postCount} post{t.postCount === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `ReelViewer.tsx`**

```tsx
// app/(sociallog)/sociallog/search/_components/ReelViewer.tsx
'use client';

import { useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export type Reel = {
  id: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  body: string | null;
  author: { username: string };
};

export function ReelViewer({ reels, startIndex, onClose }: { reels: Reel[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const reel = reels[index];

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(reels.length - 1, i + delta)));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta > 50) go(-1);
        else if (delta < -50) go(1);
        touchStartX.current = null;
      }}
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-white">
        <X className="size-6" />
      </button>
      {index > 0 && (
        <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-4 text-white">
          <ChevronLeft className="size-8" />
        </button>
      )}
      {index < reels.length - 1 && (
        <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-4 text-white">
          <ChevronRight className="size-8" />
        </button>
      )}
      <div className="max-h-[80vh] max-w-[90vw]">
        {reel.mediaType === 'video' ? (
          <video src={reel.mediaUrl ?? undefined} controls autoPlay className="max-h-[80vh] max-w-[90vw] rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reel.mediaUrl ?? undefined} alt="" className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain" />
        )}
      </div>
      <div className="mt-3 text-center text-white">
        <p className="text-sm font-semibold">@{reel.author.username}</p>
        {reel.body && <p className="text-xs text-white/80">{reel.body}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `ReelsGrid.tsx`**

```tsx
// app/(sociallog)/sociallog/search/_components/ReelsGrid.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Play } from 'lucide-react';
import { ReelViewer, type Reel } from './ReelViewer';

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load reels');
  return res.json();
}

export function ReelsGrid() {
  const { data, isLoading } = useSWR<{ reels: Reel[] }>('/api/sociallog/search/reels', fetcher);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  const reels = data?.reels ?? [];
  if (reels.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No reels yet — post a photo or video from the Dashboard.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {reels.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="relative aspect-square overflow-hidden bg-muted"
          >
            {r.mediaType === 'video' ? (
              <>
                {/* Browsers can't render a raw video URL as an <img> — prefer the
                    stored thumbnail, and fall back to a play-icon-only tile
                    (no broken image) until a thumbnail exists. */}
                {r.mediaThumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.mediaThumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
                <Play className="absolute right-1 top-1 size-4 text-white drop-shadow" fill="white" />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.mediaThumbnailUrl ?? r.mediaUrl ?? undefined} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <ReelViewer reels={reels} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
```

`Reel` (imported from `./ReelViewer`) needs a `mediaThumbnailUrl: string | null` field for this — add it in Task 3's `ReelViewer.tsx` type alongside `mediaUrl` in the next step.

- [ ] **Step 5: Wire the Search page**

Replace the full contents of `app/(sociallog)/sociallog/search/page.tsx` with:

```tsx
// app/(sociallog)/sociallog/search/page.tsx
'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserResults } from './_components/UserResults';
import { TopicResults } from './_components/TopicResults';
import { ReelsGrid } from './_components/ReelsGrid';

export default function SocialLogSearchPage() {
  const [tab, setTab] = useState<'users' | 'topics' | 'reels'>('users');
  const [query, setQuery] = useState('');

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Search" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
            <TabsTrigger value="topics" className="flex-1">Topics</TabsTrigger>
            <TabsTrigger value="reels" className="flex-1">Reels</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab !== 'reels' && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'users' ? 'Search by username…' : 'Search topics…'}
          />
        )}

        {tab === 'users' && <UserResults query={query} />}
        {tab === 'topics' && <TopicResults query={query} />}
        {tab === 'reels' && <ReelsGrid />}
      </main>
      <SocialLogBottomNav />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(sociallog)/sociallog/search"
git commit -m "feat(sociallog): build the Search UI (users/topics/reels)"
```

---

### Task 5: Photo/video attach on the compose box

**Files:**
- Modify: `app/(sociallog)/sociallog/_components/ComposeBox.tsx`

**Interfaces:**
- Consumes: `sociallog-media` Supabase Storage bucket (Foundation), `POST /api/sociallog/posts` (Phase 2, already accepts `mediaType`/`mediaUrl`).
- Produces: no new exports — same `<ComposeBox onPosted={() => void} />` signature, now capable of attaching one image or video before posting.

- [ ] **Step 1: Replace `ComposeBox.tsx`**

```tsx
// app/(sociallog)/sociallog/_components/ComposeBox.tsx
'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export function ComposeBox({ onPosted }: { onPosted: () => void }) {
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (selected: File) => {
    setError(null);
    const isImage = selected.type.startsWith('image/');
    const isVideo = selected.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Attach an image or video file');
      return;
    }
    if (isImage && selected.size > MAX_IMAGE_BYTES) {
      setError('Images must be under 10 MB');
      return;
    }
    if (isVideo && selected.size > MAX_VIDEO_BYTES) {
      setError('Videos must be under 25 MB');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const clearFile = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handlePost = async () => {
    if (!text.trim() && !file) return;
    if (!profile) return;
    setPosting(true);
    setError(null);
    try {
      let mediaUrl: string | undefined;
      let mediaType: 'image' | 'video' | undefined;

      if (file) {
        mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const ext = file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
        const path = `${profile.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('sociallog-media')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('sociallog-media').getPublicUrl(path);
        mediaUrl = publicUrlData.publicUrl;
      }

      const res = await fetch('/api/sociallog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() || undefined, mediaType, mediaUrl }),
      });
      if (!res.ok) throw new Error('Failed to post');

      setText('');
      clearFile();
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening? Use #topics to tag it."
          maxLength={500}
        />
        {previewUrl && file && (
          <div className="relative w-fit">
            {file.type.startsWith('video/') ? (
              <video src={previewUrl} className="max-h-40 rounded-lg" controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="max-h-40 rounded-lg object-cover" />
            )}
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove attachment"
              className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={posting}>
            <ImageIcon className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (selected) handleFile(selected);
            }}
          />
          <Button onClick={handlePost} disabled={posting || (!text.trim() && !file)}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : 'Post'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(sociallog)/sociallog/_components/ComposeBox.tsx"
git commit -m "feat(sociallog): add photo/video attach to the compose box"
```

---

### Task 6: Seed demo reel posts

**Files:**
- Modify: `prisma/seed-sociallog.js`

**Interfaces:**
- Produces: 2 additional demo `MEDIA` posts (inline SVG data-URI images — no external network dependency, so the seed never depends on a third-party host being reachable) so the Reels grid isn't empty before any real upload happens.

- [ ] **Step 1: Add reel posts to the seed data**

In `prisma/seed-sociallog.js`, add near the top (after `PERSONAS`):

```js
// Inline SVG data URIs — no external image host to depend on, and they
// render instantly as <img>/grid thumbnails without a network round trip.
function placeholderImage(hex, label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><rect width='600' height='600' fill='${hex}'/><text x='50%' y='50%' font-family='sans-serif' font-size='40' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const REEL_POSTS = [
  { author: 4, body: 'Race day. #fitness', mediaUrl: placeholderImage('#9e0059', 'Race Day') },
  { author: 0, body: 'New PR photo. #fitness', mediaUrl: placeholderImage('#DB2777', 'New PR') },
]
```

Then, right after the `COMMENTS` loop finishes (i.e. after the `console.log(\`✅ Seeded ${COMMENTS.length} demo comments\`)` line) and before the `VOTES` loop, add:

```js
  for (const r of REEL_POSTS) {
    const existingReel = await prisma.socialPost.findFirst({
      where: { profileId: personaProfiles[r.author].id, body: r.body },
    })
    if (!existingReel) {
      await prisma.socialPost.create({
        data: {
          profileId: personaProfiles[r.author].id,
          kind: 'MEDIA',
          body: r.body,
          mediaType: 'image',
          mediaUrl: r.mediaUrl,
        },
      })
    }
  }
  console.log(`✅ Seeded ${REEL_POSTS.length} demo reel posts`)
```

(These aren't pushed into `createdPosts`/`VOTES`/`COMMENTS` — they're standalone reel content, not referenced by index elsewhere in the script.)

- [ ] **Step 2: Re-run the seed and verify idempotency**

Run: `npm run seed:sociallog` twice in a row.
Expected: both runs print `✅ Seeded 2 demo reel posts`; `select count(*) from social_posts where kind = 'MEDIA';` in Supabase returns exactly 2 after both runs (no duplicates).

- [ ] **Step 3: Commit**

```bash
git add prisma/seed-sociallog.js
git commit -m "feat(sociallog): seed demo reel posts"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full typecheck, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed with no new errors.

- [ ] **Step 2: Manual smoke test**

Run `npm run dev`, log in, open `/sociallog/search`.
Expected: Users tab shows "type at least 2 characters" until you type, then shows matching demo personas (e.g. typing "maya" finds `maya_runs`) with a working Follow/Following toggle; Topics tab shows the seeded topics (`fitness`, `productivity`, `homelog`, `money`) sorted by post count, typing filters by prefix; Reels tab shows a 3-column grid with the 2 seeded placeholder images, tapping one opens the full-screen viewer with working prev/next arrows and swipe-to-navigate on a touch device/emulator; from the Dashboard, attaching a photo via the compose box's image icon, posting it, then reopening Search → Reels shows the new post at the top of the grid.

- [ ] **Step 3: Reset any test state**

If you posted test images while verifying, delete them from the feed/Supabase Storage if you don't want them kept.
