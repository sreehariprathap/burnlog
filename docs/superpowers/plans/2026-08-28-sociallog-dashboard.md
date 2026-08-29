# SocialLog Dashboard (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SocialLog Dashboard placeholder with a real feed — posts (text + cross-app activity cards), voting, comments, follows, Following/For You tabs with Hot/New/Top sort — wire one real cross-app activity integration (TaskLog task completion), and seed demo/mock data (Instagram-style "official account" personas) so the feed, search-adjacent follow graph, and a DM thread are populated on first look.

**Architecture:** New REST-ish API routes under `app/api/sociallog/` (posts, vote, comments, follow, activity), authenticated the same way as every existing route (`createRouteHandlerClient` for the session, `createServiceRoleClient` for the actual read/write). Feed ranking (Hot/New/Top) and per-post aggregates (score, my vote, comment count, topics) are computed in the API route in JS after a bounded fetch (candidate set capped at 100 posts) — this is a small/demo-scale app, so this avoids building SQL views or materialized scores for no benefit. The Dashboard page and its `_components/` are client components using SWR, matching the `useCurrentProfile`/board-page conventions already in the codebase. Mock data lives in a new standalone `prisma/seed-sociallog.js`, run via Prisma Client directly (bypasses RLS, same pattern as the existing `prisma/seed.js`) rather than folded into that file, since it seeds unrelated demo personas rather than data for the real seeded user.

**Tech Stack:** Same as Foundation — Next.js 15 App Router, React 19, TypeScript, `@supabase/supabase-js` (runtime data access), Prisma (schema + seeding only), SWR, shadcn/ui, lucide-react, `date-fns`.

## Global Constraints

- No automated test suite. Verification is `npx tsc --noEmit`, `npm run lint`, `npx prisma validate` (if schema touched), and manual checks against `npm run dev` / seeded data.
- Every new API route follows the exact auth shape used throughout `app/api/social/*` and `app/api/sociallog/profile-settings/route.ts`: `createRouteHandlerClient({ cookies }).auth.getUser()` for the session, then `createServiceRoleClient()` for all reads/writes.
- Feed-level privacy enforcement (hiding posts from private accounts in "For You") is explicitly **out of scope** for this phase — `isPrivate` remains a stored profile setting only enforced by messaging (`whoCanMessage`), per the design spec. Do not add ad-hoc enforcement; it needs a follow-approval workflow this spec never designed.
- Do not touch `(burnlog)`, `(lifelog)`, `(homelog)`, or `app/api/social/*`. The only file outside `sociallog`-prefixed paths this plan touches is `lib/tasklog/completeTask.ts` and its two call sites — the deliberate, single cross-app activity integration point the design spec calls for.
- New Prisma-seeded demo profiles use synthetic, stable UUIDs (not tied to any real `auth.users` row) — they are non-login "official account" personas, exactly like Instagram's bundled accounts. Re-running the seed script must be idempotent (`upsert`/`skipDuplicates`, no duplicate rows on a second run).

---

### Task 1: Posts API — feed read + create

**Files:**
- Create: `app/api/sociallog/posts/route.ts`
- Create: `lib/sociallog/hotScore.ts`

**Interfaces:**
- Produces: `hotScore(score: number, createdAt: string | Date): number` (pure function, used by Task 1's route and nowhere else yet, but exported for reuse). `GET /api/sociallog/posts?tab=following|foryou&sort=hot|new|top` → `{ posts: FeedPost[] }` where `FeedPost = { id, kind, body, mediaType, mediaUrl, mediaThumbnailUrl, sourceApp, sourceRefType, sourceRefId, createdAt, author: { id, username, firstName, avatarUrl }, score, myVote: 1 | -1 | null, commentCount, topics: string[], isFollowingAuthor: boolean }`. `POST /api/sociallog/posts` with `{ body?: string, mediaType?: 'image' | 'video', mediaUrl?: string, mediaThumbnailUrl?: string }` → `{ id }`. Task 6 (Dashboard page) and Task 8 (seed data validation) consume this shape.

- [ ] **Step 1: Create the hot-score helper**

```ts
// lib/sociallog/hotScore.ts

// Reddit's "hot" ranking formula: a log-scaled vote score plus a linear
// time-decay term. The epoch offset (seconds since 2005-12-08, reddit's own
// reference point) only has to be a fixed constant shared by every post —
// it doesn't need to mean anything for this app, it just keeps the time
// term from producing enormous numbers.
const EPOCH_OFFSET_SECONDS = 1134028003;

export function hotScore(score: number, createdAt: string | Date): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = new Date(createdAt).getTime() / 1000 - EPOCH_OFFSET_SECONDS;
  return sign * order + seconds / 45000;
}
```

- [ ] **Step 2: Create the posts API route**

```ts
// app/api/sociallog/posts/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { hotScore } from '@/lib/sociallog/hotScore';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') === 'following' ? 'following' : 'foryou';
    const sort = (['hot', 'new', 'top'].includes(searchParams.get('sort') ?? '')
      ? searchParams.get('sort')
      : 'hot') as 'hot' | 'new' | 'top';

    const { data: followRows } = await admin
      .from('social_follows')
      .select('followingId')
      .eq('followerId', meId);
    const followingIds = new Set((followRows ?? []).map((r) => r.followingId as string));

    const { data: postRows, error: postsError } = await admin
      .from('social_posts')
      .select('id, profileId, kind, body, mediaType, mediaUrl, mediaThumbnailUrl, sourceApp, sourceRefType, sourceRefId, createdAt, profile:profiles(id, username, firstName, avatarUrl)')
      .order('createdAt', { ascending: false })
      .limit(100);

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 400 });
    }

    type PostRow = {
      id: string;
      profileId: string;
      kind: string;
      body: string | null;
      mediaType: string | null;
      mediaUrl: string | null;
      mediaThumbnailUrl: string | null;
      sourceApp: string | null;
      sourceRefType: string | null;
      sourceRefId: string | null;
      createdAt: string;
      profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    let posts = (postRows ?? []) as unknown as PostRow[];
    posts = posts.filter((p) => p.profile !== null);
    if (tab === 'following') {
      posts = posts.filter((p) => p.profileId === meId || followingIds.has(p.profileId));
    }

    const postIds = posts.map((p) => p.id);

    const [{ data: voteRows }, { data: commentRows }, { data: topicRows }] = await Promise.all([
      admin.from('social_votes').select('postId, profileId, value').in('postId', postIds.length ? postIds : ['00000000-0000-0000-0000-000000000000']),
      admin.from('social_comments').select('postId').in('postId', postIds.length ? postIds : ['00000000-0000-0000-0000-000000000000']),
      admin.from('social_post_topics').select('postId, topic:social_topics(name)').in('postId', postIds.length ? postIds : ['00000000-0000-0000-0000-000000000000']),
    ]);

    const scoreByPost = new Map<string, number>();
    const myVoteByPost = new Map<string, 1 | -1>();
    for (const v of voteRows ?? []) {
      scoreByPost.set(v.postId, (scoreByPost.get(v.postId) ?? 0) + v.value);
      if (v.profileId === meId) myVoteByPost.set(v.postId, v.value as 1 | -1);
    }

    const commentCountByPost = new Map<string, number>();
    for (const c of commentRows ?? []) {
      commentCountByPost.set(c.postId, (commentCountByPost.get(c.postId) ?? 0) + 1);
    }

    const topicsByPost = new Map<string, string[]>();
    for (const row of (topicRows ?? []) as unknown as { postId: string; topic: { name: string } | null }[]) {
      if (!row.topic) continue;
      const list = topicsByPost.get(row.postId) ?? [];
      list.push(row.topic.name);
      topicsByPost.set(row.postId, list);
    }

    const feed = posts.map((p) => {
      const score = scoreByPost.get(p.id) ?? 0;
      return {
        id: p.id,
        kind: p.kind,
        body: p.body,
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        mediaThumbnailUrl: p.mediaThumbnailUrl,
        sourceApp: p.sourceApp,
        sourceRefType: p.sourceRefType,
        sourceRefId: p.sourceRefId,
        createdAt: p.createdAt,
        author: p.profile,
        score,
        myVote: myVoteByPost.get(p.id) ?? null,
        commentCount: commentCountByPost.get(p.id) ?? 0,
        topics: topicsByPost.get(p.id) ?? [],
        isFollowingAuthor: followingIds.has(p.profileId),
        _hot: hotScore(score, p.createdAt),
      };
    });

    if (sort === 'new') {
      // already createdAt desc
    } else if (sort === 'top') {
      feed.sort((a, b) => b.score - a.score);
    } else {
      feed.sort((a, b) => b._hot - a._hot);
    }

    return NextResponse.json({ posts: feed.map(({ _hot, ...rest }) => rest) });
  } catch (error) {
    console.error('sociallog posts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { body: text, mediaType, mediaUrl, mediaThumbnailUrl } = body as {
      body?: string;
      mediaType?: 'image' | 'video';
      mediaUrl?: string;
      mediaThumbnailUrl?: string;
    };

    if (!text?.trim() && !mediaUrl) {
      return NextResponse.json({ error: 'A post needs text or media' }, { status: 400 });
    }

    const { data: created, error: insertError } = await admin
      .from('social_posts')
      .insert({
        profileId: meId,
        kind: mediaUrl ? 'MEDIA' : 'TEXT',
        body: text?.trim() || null,
        mediaType: mediaUrl ? mediaType ?? null : null,
        mediaUrl: mediaUrl ?? null,
        mediaThumbnailUrl: mediaThumbnailUrl ?? null,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const topicNames = Array.from(
      new Set((text?.match(/#(\w{1,50})/g) ?? []).map((t) => t.slice(1).toLowerCase()))
    );

    for (const name of topicNames) {
      const { data: topic } = await admin
        .from('social_topics')
        .upsert({ name }, { onConflict: 'name' })
        .select('id')
        .single();
      if (topic) {
        await admin.from('social_post_topics').insert({ postId: created.id, topicId: topic.id });
      }
    }

    return NextResponse.json({ id: created.id });
  } catch (error) {
    console.error('sociallog posts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/sociallog/posts/route.ts lib/sociallog/hotScore.ts
git commit -m "feat(sociallog): add posts feed API (list + create)"
```

---

### Task 2: Vote API

**Files:**
- Create: `app/api/sociallog/posts/[id]/vote/route.ts`

**Interfaces:**
- Produces: `POST /api/sociallog/posts/:id/vote` with `{ value: 1 | -1 }` → `{ myVote: 1 | -1 | null }` (toggles off if the same value is sent twice). Consumed by Task 6's `VoteButtons`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/posts/[id]/vote/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { value } = body as { value?: 1 | -1 };
    if (value !== 1 && value !== -1) {
      return NextResponse.json({ error: 'value must be 1 or -1' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existing } = await admin
      .from('social_votes')
      .select('id, value')
      .eq('postId', postId)
      .eq('profileId', me.id)
      .maybeSingle();

    if (existing && existing.value === value) {
      await admin.from('social_votes').delete().eq('id', existing.id);
      return NextResponse.json({ myVote: null });
    }

    if (existing) {
      await admin.from('social_votes').update({ value }).eq('id', existing.id);
    } else {
      await admin.from('social_votes').insert({ postId, profileId: me.id, value });
    }

    return NextResponse.json({ myVote: value });
  } catch (error) {
    console.error('sociallog vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add "app/api/sociallog/posts/[id]/vote/route.ts"
git commit -m "feat(sociallog): add post vote API"
```

---

### Task 3: Comments API

**Files:**
- Create: `app/api/sociallog/posts/[id]/comments/route.ts`

**Interfaces:**
- Produces: `GET /api/sociallog/posts/:id/comments` → `{ comments: Comment[] }` where `Comment = { id, body, createdAt, author: { id, username, firstName, avatarUrl } }`. `POST /api/sociallog/posts/:id/comments` with `{ body: string }` → the created `Comment`. Consumed by Task 6's `CommentList`.

- [ ] **Step 1: Create the route**

```ts
// app/api/sociallog/posts/[id]/comments/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: rows, error } = await admin
      .from('social_comments')
      .select('id, body, createdAt, profile:profiles(id, username, firstName, avatarUrl)')
      .eq('postId', postId)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      id: string;
      body: string;
      createdAt: string;
      profile: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
    };

    const comments = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.profile !== null)
      .map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, author: r.profile }));

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('sociallog comments GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { body: text } = body as { body?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .eq('userId', user.id)
      .single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: created, error } = await admin
      .from('social_comments')
      .insert({ postId, profileId: me.id, body: text.trim() })
      .select('id, body, createdAt')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: created.id,
      body: created.body,
      createdAt: created.createdAt,
      author: { id: me.id, username: me.username, firstName: me.firstName, avatarUrl: me.avatarUrl },
    });
  } catch (error) {
    console.error('sociallog comments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add "app/api/sociallog/posts/[id]/comments/route.ts"
git commit -m "feat(sociallog): add post comments API"
```

---

### Task 4: Follow API

**Files:**
- Create: `app/api/sociallog/follow/route.ts`
- Create: `app/api/sociallog/follow/[id]/route.ts`

**Interfaces:**
- Produces: `POST /api/sociallog/follow` with `{ followingId: string }` → `{ ok: true }`. `DELETE /api/sociallog/follow/:id` (id = the followed profile's id) → `{ ok: true }`. Consumed by Task 6's `PostCard` follow button.

- [ ] **Step 1: Create the follow route**

```ts
// app/api/sociallog/follow/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { followingId } = body as { followingId?: string };
    if (!followingId) {
      return NextResponse.json({ error: 'followingId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (me.id === followingId) {
      return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
    }

    const { error } = await admin
      .from('social_follows')
      .upsert({ followerId: me.id, followingId }, { onConflict: 'followerId,followingId' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog follow POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the unfollow route**

```ts
// app/api/sociallog/follow/[id]/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: followingId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await admin.from('social_follows').delete().eq('followerId', me.id).eq('followingId', followingId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog unfollow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/sociallog/follow
git commit -m "feat(sociallog): add follow/unfollow API"
```

---

### Task 5: Cross-app activity helper + TaskLog integration

**Files:**
- Create: `lib/sociallog/createActivityPost.ts`
- Create: `app/api/sociallog/activity/route.ts`
- Modify: `lib/tasklog/completeTask.ts`
- Modify: `app/(tasklog)/tasklog/page.tsx` (pass `title` at the `markTaskComplete` call site)
- Modify: `app/(tasklog)/tasklog/board/page.tsx` (pass `title` at both `markTaskComplete` call sites)

**Interfaces:**
- Produces: `createActivityPost({ profileId, sourceApp, sourceRefType, sourceRefId, body }): Promise<void>` (server-only; checks `social_profile_settings.showCrossAppActivity`, defaulting to enabled when no settings row exists yet, before inserting a `CROSS_APP_ACTIVITY` post). `POST /api/sociallog/activity` with `{ sourceApp, sourceRefType, sourceRefId, body }` → `{ ok: true }`, authenticated the same way as every other route. `markTaskComplete(supabase, task, profile, completed)` — `task` gains an optional `title?: string` field; when a task is completed, it fire-and-forgets a call to the activity endpoint.

- [ ] **Step 1: Create the server-only helper**

```ts
// lib/sociallog/createActivityPost.ts
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

interface CreateActivityPostInput {
  profileId: string;
  sourceApp: string;
  sourceRefType: string;
  sourceRefId: string;
  body: string;
}

/** Inserts a CROSS_APP_ACTIVITY post unless the profile has opted out via showCrossAppActivity. */
export async function createActivityPost({
  profileId,
  sourceApp,
  sourceRefType,
  sourceRefId,
  body,
}: CreateActivityPostInput): Promise<void> {
  const admin = createServiceRoleClient();

  const { data: settings } = await admin
    .from('social_profile_settings')
    .select('showCrossAppActivity')
    .eq('profileId', profileId)
    .maybeSingle();

  if (settings && settings.showCrossAppActivity === false) return;

  await admin.from('social_posts').insert({
    profileId,
    kind: 'CROSS_APP_ACTIVITY',
    body,
    sourceApp,
    sourceRefType,
    sourceRefId,
  });
}
```

- [ ] **Step 2: Create the API route**

```ts
// app/api/sociallog/activity/route.ts
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { createActivityPost } from '@/lib/sociallog/createActivityPost';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { sourceApp, sourceRefType, sourceRefId, body: text } = body as {
      sourceApp?: string;
      sourceRefType?: string;
      sourceRefId?: string;
      body?: string;
    };
    if (!sourceApp || !sourceRefType || !sourceRefId || !text) {
      return NextResponse.json({ error: 'sourceApp, sourceRefType, sourceRefId, and body are required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await createActivityPost({ profileId: me.id, sourceApp, sourceRefType, sourceRefId, body: text });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('sociallog activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Wire it into `markTaskComplete`**

In `lib/tasklog/completeTask.ts`, change the `CompletableTask` interface and add the fire-and-forget call:

```ts
// lib/tasklog/completeTask.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { recomputeGoalProgress } from './goalProgress';
import { maybeAdvanceTaskLogStreak, type StreakProfile } from './streak';

interface CompletableTask {
  id: string;
  goalId: string | null;
  title?: string;
}

/**
 * Single entry point for toggling a task's completion — used by the Board
 * and Dashboard so streak/goal-progress side effects never get missed.
 */
export async function markTaskComplete(
  supabase: SupabaseClient,
  task: CompletableTask,
  profile: StreakProfile,
  completed: boolean
): Promise<void> {
  await supabase
    .from('tasklog_tasks')
    .update({
      completedAt: completed ? new Date().toISOString() : null,
      lane: completed ? 'done' : undefined,
    })
    .eq('id', task.id);

  if (completed) {
    if (task.goalId) {
      await recomputeGoalProgress(supabase, task.goalId);
    }
    await maybeAdvanceTaskLogStreak(supabase, profile);

    fetch('/api/sociallog/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceApp: 'tasklog',
        sourceRefType: 'task_completed',
        sourceRefId: task.id,
        body: task.title ? `Completed "${task.title}"` : 'Completed a task',
      }),
    }).catch(() => {
      // Best-effort — a failed activity post must never block task completion.
    });
  }
}
```

- [ ] **Step 4: Pass `title` at both call sites**

In `app/(tasklog)/tasklog/page.tsx`, change:

```ts
await markTaskComplete(supabase, { id: task.id, goalId: task.goalId }, toStreakProfile(profile.id, profile), completed);
```

to:

```ts
await markTaskComplete(supabase, { id: task.id, goalId: task.goalId, title: task.title }, toStreakProfile(profile.id, profile), completed);
```

In `app/(tasklog)/tasklog/board/page.tsx`, change both:

```ts
await markTaskComplete(supabase, { id: movedTask.id, goalId: movedTask.goalId }, toStreakProfile(profile.id, profile), true);
```

and

```ts
await markTaskComplete(supabase, { id: updated.id, goalId: updated.goalId }, toStreakProfile(profile.id, profile), true);
```

to:

```ts
await markTaskComplete(supabase, { id: movedTask.id, goalId: movedTask.goalId, title: movedTask.title }, toStreakProfile(profile.id, profile), true);
```

and

```ts
await markTaskComplete(supabase, { id: updated.id, goalId: updated.goalId, title: updated.title }, toStreakProfile(profile.id, profile), true);
```

respectively (`movedTask` and `updated` are already full `TaskRow` objects in scope at both call sites, so `.title` is available without an extra fetch).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add lib/sociallog/createActivityPost.ts app/api/sociallog/activity/route.ts lib/tasklog/completeTask.ts "app/(tasklog)/tasklog/page.tsx" "app/(tasklog)/tasklog/board/page.tsx"
git commit -m "feat(sociallog): wire tasklog task completion into the sociallog activity feed"
```

---

### Task 6: Dashboard UI

**Files:**
- Create: `app/(sociallog)/sociallog/_components/PostCard.tsx`
- Create: `app/(sociallog)/sociallog/_components/ComposeBox.tsx`
- Create: `app/(sociallog)/sociallog/_components/FeedControls.tsx`
- Create: `app/(sociallog)/sociallog/_components/CommentList.tsx`
- Modify: `app/(sociallog)/sociallog/page.tsx` (replace the placeholder body)

**Interfaces:**
- Consumes: `GET/POST /api/sociallog/posts`, `POST /api/sociallog/posts/:id/vote`, `GET/POST /api/sociallog/posts/:id/comments`, `POST /api/sociallog/follow`, `DELETE /api/sociallog/follow/:id` from Tasks 1-4.
- Produces: `<PostCard post={FeedPost} onVoted={(id, myVote, delta) => void} />`, `<ComposeBox onPosted={() => void} />`, `<FeedControls tab sort onTabChange onSortChange />`, `<CommentList postId={string} />` — all consumed only by `app/(sociallog)/sociallog/page.tsx` in this task.

- [ ] **Step 1: Create `CommentList.tsx`**

```tsx
// app/(sociallog)/sociallog/_components/CommentList.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; username: string; firstName: string; avatarUrl: string | null };
};

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load comments');
  return res.json();
}

export function CommentList({ postId }: { postId: string }) {
  const { data, mutate, isLoading } = useSWR<{ comments: Comment[] }>(
    `/api/sociallog/posts/${postId}/comments`,
    fetcher
  );
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/sociallog/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      const created: Comment = await res.json();
      mutate((prev) => ({ comments: [...(prev?.comments ?? []), created] }), { revalidate: false });
      setText('');
    }
    setPosting(false);
  };

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {(data?.comments ?? []).map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar className="size-7">
            {c.author.avatarUrl && <AvatarImage src={c.author.avatarUrl} alt={c.author.username} />}
            <AvatarFallback className="text-[10px]">{c.author.firstName?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 rounded-lg bg-muted px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">@{c.author.username}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNowStrict(new Date(c.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm">{c.body}</p>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePost();
          }}
        />
        <Button size="sm" onClick={handlePost} disabled={posting || !text.trim()}>
          Reply
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `PostCard.tsx`**

```tsx
// app/(sociallog)/sociallog/_components/PostCard.tsx
'use client';

import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowBigUp, ArrowBigDown, MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentList } from './CommentList';

export type FeedPost = {
  id: string;
  kind: string;
  body: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  sourceApp: string | null;
  sourceRefType: string | null;
  createdAt: string;
  author: { id: string; username: string; firstName: string; avatarUrl: string | null };
  score: number;
  myVote: 1 | -1 | null;
  commentCount: number;
  topics: string[];
  isFollowingAuthor: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  burnlog: 'BurnLog',
  tasklog: 'TaskLog',
  homelog: 'HomeLog',
  lifelog: 'LifeLog',
};

export function PostCard({ post, currentProfileId }: { post: FeedPost; currentProfileId: string | null }) {
  const [score, setScore] = useState(post.score);
  const [myVote, setMyVote] = useState<1 | -1 | null>(post.myVote);
  const [following, setFollowing] = useState(post.isFollowingAuthor);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const vote = async (value: 1 | -1) => {
    const prevScore = score;
    const prevVote = myVote;
    const nextVote = prevVote === value ? null : value;
    setScore(prevScore - (prevVote ?? 0) + (nextVote ?? 0));
    setMyVote(nextVote);

    const res = await fetch(`/api/sociallog/posts/${post.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      setScore(prevScore);
      setMyVote(prevVote);
    }
  };

  const toggleFollow = async () => {
    setFollowBusy(true);
    if (following) {
      await fetch(`/api/sociallog/follow/${post.author.id}`, { method: 'DELETE' });
      setFollowing(false);
    } else {
      await fetch('/api/sociallog/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: post.author.id }),
      });
      setFollowing(true);
    }
    setFollowBusy(false);
  };

  const isOwnPost = currentProfileId === post.author.id;
  const isActivity = post.kind === 'CROSS_APP_ACTIVITY';

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar className="size-9">
              {post.author.avatarUrl && <AvatarImage src={post.author.avatarUrl} alt={post.author.username} />}
              <AvatarFallback>{post.author.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">@{post.author.username}</span>
                {isActivity && post.sourceApp && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    via {SOURCE_LABELS[post.sourceApp] ?? post.sourceApp}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {!isOwnPost && (
            <Button variant={following ? 'outline' : 'default'} size="sm" onClick={toggleFollow} disabled={followBusy}>
              {following ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>

        {post.body && <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>}

        {post.mediaUrl && post.mediaType === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.mediaUrl} alt="" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
        )}
        {post.mediaUrl && post.mediaType === 'video' && (
          <video src={post.mediaUrl} controls className="mt-3 max-h-96 w-full rounded-lg" />
        )}

        {post.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.topics.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => vote(1)}
              aria-label="Upvote"
              className={cn('rounded-full p-1', myVote === 1 ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <ArrowBigUp className="size-5" fill={myVote === 1 ? 'currentColor' : 'none'} />
            </button>
            <span className="min-w-6 text-center text-sm font-medium">{score}</span>
            <button
              type="button"
              onClick={() => vote(-1)}
              aria-label="Downvote"
              className={cn('rounded-full p-1', myVote === -1 ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <ArrowBigDown className="size-5" fill={myVote === -1 ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="size-4" />
            {post.commentCount}
          </button>
        </div>

        {commentsOpen && <CommentList postId={post.id} />}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `ComposeBox.tsx`**

```tsx
// app/(sociallog)/sociallog/_components/ComposeBox.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function ComposeBox({ onPosted }: { onPosted: () => void }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch('/api/sociallog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      setText('');
      onPosted();
    }
    setPosting(false);
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
        <div className="flex justify-end">
          <Button onClick={handlePost} disabled={posting || !text.trim()}>
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create `FeedControls.tsx`**

```tsx
// app/(sociallog)/sociallog/_components/FeedControls.tsx
'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'foryou' | 'following';
type Sort = 'hot' | 'new' | 'top';

export function FeedControls({
  tab,
  sort,
  onTabChange,
  onSortChange,
}: {
  tab: Tab;
  sort: Sort;
  onTabChange: (tab: Tab) => void;
  onSortChange: (sort: Sort) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as Tab)}>
        <TabsList>
          <TabsTrigger value="foryou">For You</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={sort} onValueChange={(v) => onSortChange(v as Sort)}>
        <TabsList>
          <TabsTrigger value="hot">Hot</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="top">Top</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Wire the Dashboard page**

Replace the full contents of `app/(sociallog)/sociallog/page.tsx` with:

```tsx
// app/(sociallog)/sociallog/page.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { ComposeBox } from './_components/ComposeBox';
import { FeedControls } from './_components/FeedControls';
import { PostCard, type FeedPost } from './_components/PostCard';
import { Loader2 } from 'lucide-react';

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export default function SocialLogDashboardPage() {
  const { profile } = useCurrentProfile();
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [sort, setSort] = useState<'hot' | 'new' | 'top'>('hot');

  const { data, isLoading, mutate } = useSWR<{ posts: FeedPost[] }>(
    `/api/sociallog/posts?tab=${tab}&sort=${sort}`,
    fetcher
  );

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="SocialLog" />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <ComposeBox onPosted={() => mutate()} />
        <FeedControls tab={tab} sort={sort} onTabChange={setTab} onSortChange={setSort} />
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && (data?.posts.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tab === 'following' ? "Nobody you follow has posted yet." : 'No posts yet — be the first.'}
          </p>
        )}
        {(data?.posts ?? []).map((post) => (
          <PostCard key={post.id} post={post} currentProfileId={profile?.id ?? null} />
        ))}
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
git add "app/(sociallog)/sociallog/_components" "app/(sociallog)/sociallog/page.tsx"
git commit -m "feat(sociallog): build the Dashboard feed UI"
```

---

### Task 7: Mock/demo data seed

**Files:**
- Create: `prisma/seed-sociallog.js`
- Modify: `package.json` (add a `seed:sociallog` script)

**Interfaces:**
- Produces: an idempotent script, run via `npm run seed:sociallog` (optionally with `SEED_FOLLOW_USER_ID=<your-auth-uid>` to also have the demo accounts follow/DM your real account), that creates 6 demo "official account"-style profiles with bios, posts (text + cross-app activity), votes, comments, topics, a mutual follow graph, and one DM thread — populating the Dashboard/feed the same way Instagram ships bundled/suggested accounts.

- [ ] **Step 1: Create the seed script**

```js
// prisma/seed-sociallog.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Stable synthetic UUIDs — these are demo "official account" personas with
// no matching auth.users row (they can't log in), same idea as Instagram's
// bundled/suggested accounts on a fresh install. Fixed IDs make the script
// idempotent: re-running it upserts the same rows instead of duplicating.
const PERSONAS = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    username: 'burnlog_official',
    firstName: 'BurnLog',
    lastName: 'Team',
    bio: 'Official BurnLog account. PRs, streaks, and workout tips.',
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    username: 'tasklog_tips',
    firstName: 'TaskLog',
    lastName: 'Tips',
    bio: 'Productivity tips from the TaskLog team.',
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    username: 'homelog_hq',
    firstName: 'HomeLog',
    lastName: 'HQ',
    bio: 'Running a household, made easier.',
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    username: 'lifelog_money',
    firstName: 'LifeLog',
    lastName: 'Money',
    bio: 'Budgeting and money tips.',
  },
  {
    id: '11111111-1111-1111-1111-111111111105',
    username: 'maya_runs',
    firstName: 'Maya',
    lastName: 'Chen',
    bio: 'Marathon training. Sharing the ups and downs.',
  },
  {
    id: '11111111-1111-1111-1111-111111111106',
    username: 'devon_builds',
    firstName: 'Devon',
    lastName: 'Okafor',
    bio: 'Shipping side projects one task at a time.',
  },
]

const POSTS = [
  { author: 0, kind: 'TEXT', body: 'New PR on deadlifts today. #fitness Consistency beats intensity, every time.', hoursAgo: 2 },
  { author: 0, kind: 'CROSS_APP_ACTIVITY', body: 'Hit a 14-day workout streak 🔥', sourceApp: 'burnlog', sourceRefType: 'streak_milestone', hoursAgo: 20 },
  { author: 1, kind: 'TEXT', body: 'Tip: timebox your inbox to 2x 20-minute blocks a day. #productivity', hoursAgo: 5 },
  { author: 1, kind: 'CROSS_APP_ACTIVITY', body: 'Completed "Ship SocialLog Foundation"', sourceApp: 'tasklog', sourceRefType: 'task_completed', hoursAgo: 1 },
  { author: 2, kind: 'TEXT', body: 'Chore rotation actually works if everyone can see the schedule. #homelog', hoursAgo: 30 },
  { author: 3, kind: 'TEXT', body: 'Zero-based budgeting month 3: still boring, still working. #money', hoursAgo: 10 },
  { author: 4, kind: 'TEXT', body: '18 miles this morning, legs are done. #fitness', hoursAgo: 3 },
  { author: 4, kind: 'CROSS_APP_ACTIVITY', body: 'Hit a 7-day workout streak 🔥', sourceApp: 'burnlog', sourceRefType: 'streak_milestone', hoursAgo: 50 },
  { author: 5, kind: 'TEXT', body: 'Refactored the onboarding flow, conversion should be better now. #productivity', hoursAgo: 8 },
  { author: 5, kind: 'TEXT', body: 'Anyone else use #topics to organize side-project notes?', hoursAgo: 40 },
]

const COMMENTS = [
  { post: 0, author: 4, body: 'Let\'s go! What\'s your program?' },
  { post: 0, author: 5, body: 'Deadlifts are the best PR to chase.' },
  { post: 2, author: 5, body: 'Stealing this.' },
  { post: 6, author: 0, body: 'Legend. Recovery day tomorrow?' },
  { post: 8, author: 1, body: 'Nice — what did conversion look like before?' },
]

const VOTES = [
  [0, 1, 1], [0, 4, 1], [0, 5, 1],
  [1, 4, 1], [1, 2, 1],
  [2, 5, 1], [2, 0, 1], [2, 3, -1],
  [3, 1, 1],
  [4, 3, 1], [4, 2, 1],
  [6, 0, 1], [6, 1, 1], [6, 5, 1],
  [8, 0, 1], [8, 4, 1],
]

async function main() {
  const followUserId = process.env.SEED_FOLLOW_USER_ID || null

  const personaProfiles = []
  for (const p of PERSONAS) {
    const profile = await prisma.profile.upsert({
      where: { userId: p.id },
      update: {},
      create: {
        userId: p.id,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        age: 28,
        weight: 70,
        height: 175,
        activityLevel: 'moderate',
      },
    })
    await prisma.socialProfileSettings.upsert({
      where: { profileId: profile.id },
      update: { bio: p.bio },
      create: { profileId: profile.id, bio: p.bio, isPrivate: false, whoCanMessage: 'everyone', showCrossAppActivity: true },
    })
    personaProfiles.push(profile)
  }
  console.log(`✅ Seeded ${personaProfiles.length} demo personas`)

  // Mutual follow graph among personas.
  for (let i = 0; i < personaProfiles.length; i++) {
    for (let j = 0; j < personaProfiles.length; j++) {
      if (i === j) continue
      // Not fully-connected — every persona follows 3 others, deterministically.
      if ((j - i + personaProfiles.length) % personaProfiles.length > 3) continue
      await prisma.socialFollow.upsert({
        where: { followerId_followingId: { followerId: personaProfiles[i].id, followingId: personaProfiles[j].id } },
        update: {},
        create: { followerId: personaProfiles[i].id, followingId: personaProfiles[j].id },
      })
    }
  }
  console.log('✅ Seeded persona follow graph')

  const now = Date.now()
  const createdPosts = []
  for (const p of POSTS) {
    const createdAt = new Date(now - p.hoursAgo * 60 * 60 * 1000)
    const post = await prisma.socialPost.create({
      data: {
        profileId: personaProfiles[p.author].id,
        kind: p.kind,
        body: p.body,
        sourceApp: p.sourceApp ?? null,
        sourceRefType: p.sourceRefType ?? null,
        sourceRefId: p.sourceRefType ? `seed-${p.author}-${p.hoursAgo}` : null,
        createdAt,
        updatedAt: createdAt,
      },
    })
    createdPosts.push(post)

    const topicNames = Array.from(new Set((p.body.match(/#(\w+)/g) || []).map((t) => t.slice(1).toLowerCase())))
    for (const name of topicNames) {
      const topic = await prisma.socialTopic.upsert({ where: { name }, update: {}, create: { name } })
      await prisma.socialPostTopic.upsert({
        where: { postId_topicId: { postId: post.id, topicId: topic.id } },
        update: {},
        create: { postId: post.id, topicId: topic.id },
      })
    }
  }
  console.log(`✅ Seeded ${createdPosts.length} demo posts`)

  for (const c of COMMENTS) {
    await prisma.socialComment.create({
      data: { postId: createdPosts[c.post].id, profileId: personaProfiles[c.author].id, body: c.body },
    })
  }
  console.log(`✅ Seeded ${COMMENTS.length} demo comments`)

  for (const [postIdx, authorIdx, value] of VOTES) {
    await prisma.socialVote.upsert({
      where: { postId_profileId: { postId: createdPosts[postIdx].id, profileId: personaProfiles[authorIdx].id } },
      update: { value },
      create: { postId: createdPosts[postIdx].id, profileId: personaProfiles[authorIdx].id, value },
    })
  }
  console.log(`✅ Seeded ${VOTES.length} demo votes`)

  if (followUserId) {
    const me = await prisma.profile.findUnique({ where: { userId: followUserId } })
    if (!me) {
      console.warn(`⚠️  SEED_FOLLOW_USER_ID=${followUserId} has no matching profile — skipping follow/DM seeding for it.`)
    } else {
      // The 3 team accounts auto-follow you (Instagram-style "suggested" bootstrap).
      for (const p of personaProfiles.slice(0, 3)) {
        await prisma.socialFollow.upsert({
          where: { followerId_followingId: { followerId: p.id, followingId: me.id } },
          update: {},
          create: { followerId: p.id, followingId: me.id },
        })
      }
      // You follow the team + Maya back.
      for (const p of [personaProfiles[0], personaProfiles[1], personaProfiles[4]]) {
        await prisma.socialFollow.upsert({
          where: { followerId_followingId: { followerId: me.id, followingId: p.id } },
          update: {},
          create: { followerId: me.id, followingId: p.id },
        })
      }
      console.log('✅ Linked demo personas to your account\'s follow graph')

      const welcomeFrom = personaProfiles[0]
      const [participantAId, participantBId] = [welcomeFrom.id, me.id].sort()
      const thread = await prisma.socialMessageThread.upsert({
        where: { participantAId_participantBId: { participantAId, participantBId } },
        update: {},
        create: { participantAId, participantBId },
      })
      const existingMessages = await prisma.socialMessage.count({ where: { threadId: thread.id } })
      if (existingMessages === 0) {
        await prisma.socialMessage.createMany({
          data: [
            { threadId: thread.id, senderId: welcomeFrom.id, body: 'Welcome to SocialLog! 👋' },
            { threadId: thread.id, senderId: welcomeFrom.id, body: 'Follow a few accounts and your feed will fill up fast.' },
          ],
        })
      }
      console.log('✅ Seeded a welcome DM thread')
    }
  } else {
    console.log('ℹ️  Set SEED_FOLLOW_USER_ID=<your-auth-uid> to also link these demo accounts to your real profile.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 2: Add the npm script**

In `package.json`, in `"scripts"`, add (alongside the existing `"pwa:start"` entry):

```json
    "seed:sociallog": "ts-node --esm prisma/seed-sociallog.js"
```

- [ ] **Step 3: Run the seed**

Run: `npx prisma generate && npm run seed:sociallog`
Expected: console output ending in the 6 "✅ Seeded …" lines (or 7-8 if `SEED_FOLLOW_USER_ID` is set), no errors.

To also link the demo accounts to your real logged-in account, find your auth UID (Supabase dashboard → Authentication → Users, or `select id from auth.users where email = '<your email>'` in the SQL editor) and re-run: `SEED_FOLLOW_USER_ID=<your-uid> npm run seed:sociallog`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-sociallog.js package.json
git commit -m "feat(sociallog): add demo/mock data seed script"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full typecheck, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed with no new errors.

- [ ] **Step 2: Seed and inspect via Supabase**

Run `npm run seed:sociallog` (with `SEED_FOLLOW_USER_ID` set to your real UID if you want it linked to your account), then confirm via SQL: `select count(*) from social_posts;` returns 10, `select count(*) from social_follows) ` is non-zero, `select count(*) from social_message_threads;` is 1 if `SEED_FOLLOW_USER_ID` was set.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, log in, open `/sociallog`.
Expected: feed shows the 10 seeded posts (mix of plain posts and "via TaskLog"/"via BurnLog" activity cards) sorted by Hot by default; switching to New re-orders by recency; switching to Top re-orders by score; switching the top tab to "Following" shows only posts from accounts you follow (empty unless you ran the seed with `SEED_FOLLOW_USER_ID`, or you've followed someone via a post's Follow button); upvoting/downvoting a post updates the score immediately and persists across a reload; opening a post's comment count shows the seeded comments and lets you add a new one; posting from the compose box with `#sometag` in the text appears in the feed immediately with the tag rendered as a chip; completing a TaskLog task creates a new activity-card post at the top of your own feed within a few seconds.

- [ ] **Step 4: Reset any test state**

If you followed/unfollowed demo accounts or posted test content while verifying, clean those up if you don't want them in your real feed going forward — the seeded demo posts/accounts themselves are meant to stay.
