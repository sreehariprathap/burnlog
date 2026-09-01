import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export async function GET() {
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
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: items } = await admin
      .from('household_shopping_list_items')
      .select('id, inventoryItemId, label, addedByProfileId, createdAt')
      .eq('householdId', membership.householdId)
      .is('checkedAt', null)
      .order('createdAt', { ascending: false });

    const adderIds = [...new Set((items ?? []).map((i) => i.addedByProfileId))];
    const { data: profiles } = adderIds.length
      ? await admin.from('profiles').select('id, firstName').in('id', adderIds)
      : { data: [] as { id: string; firstName: string }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const result = (items ?? []).map((item) => ({
      ...item,
      addedByName: profileById.get(item.addedByProfileId)?.firstName ?? 'Unknown',
    }));

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error('list shopping list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { label, inventoryItemId } = (await request.json()) as { label?: string; inventoryItemId?: string | null };
    if (!label?.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
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

    const { data: item, error: insertError } = await admin
      .from('household_shopping_list_items')
      .insert([
        {
          householdId: membership.householdId,
          inventoryItemId: inventoryItemId || null,
          label: label.trim(),
          addedByProfileId: meId,
        },
      ])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('add shopping list item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
