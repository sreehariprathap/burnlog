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
