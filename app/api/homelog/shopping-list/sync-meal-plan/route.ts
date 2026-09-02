import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export async function POST() {
  try {
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
      return NextResponse.json({ synced: false, reason: 'no_household' });
    }

    const { data: groceryList } = await admin
      .from('grocery_lists')
      .select('items')
      .eq('profileId', meId)
      .maybeSingle();

    const items = (groceryList?.items ?? {}) as Record<string, string[]>;
    const labels = [...new Set(Object.values(items).flat().map((item) => item.trim()).filter(Boolean))];
    if (labels.length === 0) {
      return NextResponse.json({ synced: true, count: 0 });
    }

    const { data: existing } = await admin
      .from('household_shopping_list_items')
      .select('label')
      .eq('householdId', membership.householdId)
      .is('checkedAt', null);
    const existingLabels = new Set((existing ?? []).map((i) => i.label));

    const toInsert = labels
      .filter((label) => !existingLabels.has(label))
      .map((label) => ({
        householdId: membership.householdId,
        label,
        addedByProfileId: meId,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({ synced: true, count: 0 });
    }

    const { error: insertError } = await admin.from('household_shopping_list_items').insert(toInsert);
    if (insertError) {
      console.error('sync-meal-plan: insert failed:', insertError);
      return NextResponse.json({ error: 'Could not sync your grocery list to HomeLog.' }, { status: 500 });
    }

    return NextResponse.json({ synced: true, count: toInsert.length });
  } catch (error) {
    console.error('sync-meal-plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
