import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params;
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

    const { data: myMembership } = await admin
      .from('travellog_plan_members')
      .select('role')
      .eq('planId', planId)
      .eq('profileId', me.id)
      .maybeSingle();
    if (!myMembership) {
      return NextResponse.json({ error: 'Not a member of this trip' }, { status: 403 });
    }

    const { data: plan } = await admin.from('travellog_plans').select('*').eq('id', planId).maybeSingle();
    if (!plan) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const { data: memberRows } = await admin
      .from('travellog_plan_members')
      .select('profileId, role, joinedAt')
      .eq('planId', planId);
    const memberIds = (memberRows ?? []).map((m) => m.profileId);
    const { data: memberProfiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl')
      .in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);
    const profileById = new Map((memberProfiles ?? []).map((p) => [p.id, p]));
    const members = (memberRows ?? []).map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      profile: profileById.get(m.profileId) ?? null,
    }));

    const { data: visits } = await admin
      .from('travellog_visits')
      .select('id, profileId, placeName, country, lat, lng, arrivalDate, departureDate, notes')
      .eq('tripPlanId', planId)
      .order('arrivalDate', { ascending: true });

    return NextResponse.json({ plan, myRole: myMembership.role, members, visits: visits ?? [] });
  } catch (error) {
    console.error('get trip detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
