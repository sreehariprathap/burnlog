import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';

async function getMyProfileId(admin: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { addresseeUsername } = body as { addresseeUsername?: string };
    if (!addresseeUsername?.trim()) {
      return NextResponse.json({ error: 'addresseeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: addressee } = await admin
      .from('profiles')
      .select('id')
      .eq('username', addresseeUsername.trim().toLowerCase())
      .maybeSingle();

    if (!addressee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (addressee.id === meId) {
      return NextResponse.json({ error: "You can't add yourself" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from('friendships')
      .select('id, status')
      .or(
        `and(requesterId.eq.${meId},addresseeId.eq.${addressee.id}),and(requesterId.eq.${addressee.id},addresseeId.eq.${meId})`
      )
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: existing.status === 'accepted' ? 'Already friends' : 'A request already exists' },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from('friendships')
      .insert({ requesterId: meId, addresseeId: addressee.id })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ id: inserted.id });
  } catch (error) {
    console.error('send friend request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
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

    const { data: rows } = await admin
      .from('friendships')
      .select('id, requesterId, createdAt, requester:profiles!friendships_requesterId_fkey(username, firstName, xp)')
      .eq('addresseeId', meId)
      .eq('status', 'pending');

    const incoming = (rows ?? []).map((r: any) => ({
      id: r.id,
      requesterId: r.requesterId,
      requesterUsername: r.requester.username,
      requesterFirstName: r.requester.firstName,
      requesterLevel: computeLevel(r.requester.xp),
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ incoming });
  } catch (error) {
    console.error('list friend requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
