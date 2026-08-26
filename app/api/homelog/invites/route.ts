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
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: invites } = await admin
      .from('household_invites')
      .select('id, householdId, invitedById, createdAt')
      .eq('inviteeId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    const householdIds = [...new Set(invites.map((i) => i.householdId))];
    const inviterIds = [...new Set(invites.map((i) => i.invitedById))];

    const [{ data: households }, { data: inviters }] = await Promise.all([
      admin.from('households').select('id, name').in('id', householdIds),
      admin.from('profiles').select('id, username, firstName').in('id', inviterIds),
    ]);

    const householdById = new Map((households ?? []).map((h) => [h.id, h]));
    const inviterById = new Map((inviters ?? []).map((p) => [p.id, p]));

    const enriched = invites.map((invite) => ({
      id: invite.id,
      householdId: invite.householdId,
      householdName: householdById.get(invite.householdId)?.name ?? 'Unknown household',
      invitedByUsername: inviterById.get(invite.invitedById)?.username ?? 'someone',
      createdAt: invite.createdAt,
    }));

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('list household invites error:', error);
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

    const { inviteeUsername } = (await request.json()) as { inviteeUsername?: string };
    if (!inviteeUsername || !inviteeUsername.trim()) {
      return NextResponse.json({ error: 'inviteeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: myMembership } = await admin
      .from('household_members')
      .select('householdId')
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership) {
      return NextResponse.json({ error: 'Create or join a household first' }, { status: 400 });
    }

    const { data: invitee } = await admin
      .from('profiles')
      .select('id')
      .eq('username', inviteeUsername.trim().toLowerCase())
      .maybeSingle();
    if (!invitee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (invitee.id === me.id) {
      return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
    }

    const { data: inviteeMembership } = await admin
      .from('household_members')
      .select('id')
      .eq('profileId', invitee.id)
      .maybeSingle();
    if (inviteeMembership) {
      return NextResponse.json({ error: 'That user is already in a household' }, { status: 409 });
    }

    const { data: existingInvite } = await admin
      .from('household_invites')
      .select('id')
      .eq('householdId', myMembership.householdId)
      .eq('inviteeId', invitee.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for that user' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await admin
      .from('household_invites')
      .insert([{ householdId: myMembership.householdId, invitedById: me.id, inviteeId: invitee.id }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ invite });
  } catch (error) {
    console.error('create household invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
