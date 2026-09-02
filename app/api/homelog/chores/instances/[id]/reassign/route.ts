import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { assignedProfileId?: string | null };
    if (body.assignedProfileId !== null && typeof body.assignedProfileId !== 'string') {
      return NextResponse.json({ error: 'assignedProfileId must be a string or null' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: instance, error: fetchError } = await admin
      .from('household_chore_instances')
      .select('id, choreId, completedAt')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !instance) {
      return NextResponse.json({ error: 'Chore instance not found' }, { status: 404 });
    }
    if (instance.completedAt) {
      return NextResponse.json({ error: 'Cannot reassign a completed chore' }, { status: 400 });
    }

    const { data: chore } = await admin
      .from('household_chores')
      .select('id, householdId')
      .eq('id', instance.choreId)
      .maybeSingle();
    if (!chore || chore.householdId !== membership.householdId) {
      return NextResponse.json({ error: 'Not your household chore' }, { status: 403 });
    }

    if (body.assignedProfileId) {
      const { data: targetMember } = await admin
        .from('household_members')
        .select('profileId')
        .eq('householdId', membership.householdId)
        .eq('profileId', body.assignedProfileId)
        .maybeSingle();
      if (!targetMember) {
        return NextResponse.json({ error: 'That person is not a member of your household' }, { status: 400 });
      }
    }

    const { error: updateError } = await admin
      .from('household_chore_instances')
      .update({ assignedProfileId: body.assignedProfileId ?? null })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('reassign chore instance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
