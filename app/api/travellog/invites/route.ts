import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET() {
  try {
    const supabase = await createClient();
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
      .from('travellog_plan_invites')
      .select('id, planId, invitedById, createdAt')
      .eq('inviteeId', me.id)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (!invites || invites.length === 0) {
      return NextResponse.json({ invites: [] });
    }

    const planIds = [...new Set(invites.map((i) => i.planId))];
    const inviterIds = [...new Set(invites.map((i) => i.invitedById))];

    const [{ data: plans }, { data: inviters }] = await Promise.all([
      admin.from('travellog_plans').select('id, destination, startDate, endDate').in('id', planIds),
      admin.from('profiles').select('id, username, firstName').in('id', inviterIds),
    ]);

    const planById = new Map((plans ?? []).map((p) => [p.id, p]));
    const inviterById = new Map((inviters ?? []).map((p) => [p.id, p]));

    const enriched = invites.map((invite) => ({
      id: invite.id,
      planId: invite.planId,
      destination: planById.get(invite.planId)?.destination ?? 'Unknown trip',
      startDate: planById.get(invite.planId)?.startDate ?? null,
      endDate: planById.get(invite.planId)?.endDate ?? null,
      invitedByUsername: inviterById.get(invite.invitedById)?.username ?? 'someone',
      createdAt: invite.createdAt,
    }));

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    console.error('list trip invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
