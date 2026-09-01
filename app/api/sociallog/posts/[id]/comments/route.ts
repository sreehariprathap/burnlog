import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = await createClient();
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
    const supabase = await createClient();
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
