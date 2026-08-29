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
