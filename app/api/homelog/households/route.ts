import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { name } = (await request.json()) as { name?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Household name is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: existingMembership } = await admin
      .from('household_members')
      .select('id')
      .eq('profileId', me.id)
      .maybeSingle();
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a household' }, { status: 409 });
    }

    const { data: household, error: insertHouseholdError } = await admin
      .from('households')
      .insert([{ name: name.trim() }])
      .select()
      .single();
    if (insertHouseholdError || !household) {
      return NextResponse.json({ error: insertHouseholdError?.message || 'Failed to create household' }, { status: 400 });
    }

    const { error: insertMemberError } = await admin
      .from('household_members')
      .insert([{ householdId: household.id, profileId: me.id, role: 'owner' }]);
    if (insertMemberError) {
      await admin.from('households').delete().eq('id', household.id);
      return NextResponse.json({ error: insertMemberError.message }, { status: 400 });
    }

    return NextResponse.json({ household });
  } catch (error) {
    console.error('create household error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
