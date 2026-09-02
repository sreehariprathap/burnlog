// app/api/adminlog/test-onboarding/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller, findTestProfile, TEST_ONBOARDING_TABLES } from '@/lib/adminlog/testOnboarding';

export async function GET() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const testProfile = await findTestProfile(admin);
  if (!testProfile) {
    return NextResponse.json({ profile: null, tables: {} });
  }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', testProfile.id)
    .single();

  const tables: Record<string, unknown[]> = {};
  for (const { table } of TEST_ONBOARDING_TABLES) {
    if (table === 'household_chores') continue; // owned via householdId, handled separately below
    const { data } = await admin.from(table).select('*').eq('profileId', testProfile.id);
    tables[table] = data ?? [];
  }

  const { data: membership } = await admin
    .from('household_members')
    .select('householdId')
    .eq('profileId', testProfile.id)
    .maybeSingle();

  if (membership) {
    const { data: chores } = await admin
      .from('household_chores')
      .select('*')
      .eq('householdId', membership.householdId);
    tables.household_chores = chores ?? [];
  } else {
    tables.household_chores = [];
  }

  return NextResponse.json({ profile: profileRow ?? null, tables });
}

export async function DELETE() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const testProfile = await findTestProfile(admin);
  if (!testProfile) {
    return NextResponse.json({ ok: true }); // nothing to reset
  }

  // Re-confirm the guard directly against the row we're about to delete —
  // never rely solely on findTestProfile's own filter.
  const { data: guard } = await admin
    .from('profiles')
    .select('id, isTestAccount')
    .eq('id', testProfile.id)
    .single();
  if (!guard?.isTestAccount) {
    return NextResponse.json({ error: 'Refusing to reset a non-test profile' }, { status: 400 });
  }

  for (const { table } of TEST_ONBOARDING_TABLES) {
    if (table === 'household_chores') continue;
    await admin.from(table).delete().eq('profileId', testProfile.id);
  }

  const { data: membership } = await admin
    .from('household_members')
    .select('householdId')
    .eq('profileId', testProfile.id)
    .maybeSingle();

  if (membership) {
    const { count: otherMembers } = await admin
      .from('household_members')
      .select('id', { count: 'exact', head: true })
      .eq('householdId', membership.householdId)
      .neq('profileId', testProfile.id);

    await admin.from('household_chores').delete().eq('householdId', membership.householdId);
    await admin.from('household_members').delete().eq('profileId', testProfile.id);

    // Only remove the household itself if the test account was its sole
    // member — never delete a household a real user might also belong to.
    if (!otherMembers) {
      await admin.from('households').delete().eq('id', membership.householdId);
    }
  }

  const { error: deleteError } = await admin.from('profiles').delete().eq('id', testProfile.id);
  if (deleteError) {
    console.error('test-onboarding DELETE: failed to delete profile', deleteError);
    return NextResponse.json({ error: 'Failed to reset test profile' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
