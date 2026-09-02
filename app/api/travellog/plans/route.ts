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

    const { data: memberships } = await admin
      .from('travellog_plan_members')
      .select('planId, role')
      .eq('profileId', me.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    const planIds = memberships.map((m) => m.planId);
    const { data: plans } = await admin
      .from('travellog_plans')
      .select('id, destination, startDate, endDate, status')
      .in('id', planIds)
      .order('startDate', { ascending: false });

    const roleByPlanId = new Map(memberships.map((m) => [m.planId, m.role]));
    const enriched = (plans ?? []).map((p) => ({ ...p, myRole: roleByPlanId.get(p.id) ?? 'member' }));

    return NextResponse.json({ plans: enriched });
  } catch (error) {
    console.error('list trips error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
