import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { sendPushToUser } from '@/lib/pushNotification/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { inviteeUsername } = (await request.json()) as { inviteeUsername?: string };
    if (!inviteeUsername || !inviteeUsername.trim()) {
      return NextResponse.json({ error: 'inviteeUsername is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id, username, firstName').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: myMembership } = await admin
      .from('travellog_plan_members')
      .select('role')
      .eq('planId', planId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership || myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the trip owner can invite' }, { status: 403 });
    }

    const { data: plan } = await admin.from('travellog_plans').select('destination').eq('id', planId).maybeSingle();
    if (!plan) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { data: invitee } = await admin
      .from('profiles')
      .select('id, userId')
      .eq('username', inviteeUsername.trim().toLowerCase())
      .maybeSingle();
    if (!invitee) {
      return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
    }
    if (invitee.id === me.id) {
      return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
    }

    const { data: existingMember } = await admin
      .from('travellog_plan_members')
      .select('id')
      .eq('planId', planId)
      .eq('profileId', invitee.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: 'That user is already on this trip' }, { status: 409 });
    }

    const { data: existingInvite } = await admin
      .from('travellog_plan_invites')
      .select('id')
      .eq('planId', planId)
      .eq('inviteeId', invitee.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json({ error: 'A pending invite already exists for that user' }, { status: 409 });
    }

    const { data: invite, error: insertError } = await admin
      .from('travellog_plan_invites')
      .insert([{ planId, invitedById: me.id, inviteeId: invitee.id }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    try {
      const inviterName = me.firstName || me.username;
      await sendPushToUser(admin, invitee.userId, {
        title: 'New trip invite',
        message: `${inviterName} invited you to join the trip to ${plan.destination}.`,
        url: '/travellog?tab=plan',
      });
    } catch (pushError) {
      console.error('trip invite push error:', pushError);
    }

    return NextResponse.json({ invite });
  } catch (error) {
    console.error('create trip invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
