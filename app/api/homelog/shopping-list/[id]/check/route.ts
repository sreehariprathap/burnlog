import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { data: item } = await admin
      .from('household_shopping_list_items')
      .select('id, householdId, inventoryItemId, checkedAt')
      .eq('id', id)
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (item.householdId !== membership.householdId) {
      return NextResponse.json({ error: 'Not your household item' }, { status: 403 });
    }
    if (item.checkedAt) {
      return NextResponse.json({ error: 'Already checked off' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('household_shopping_list_items')
      .update({ checkedAt: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (item.inventoryItemId) {
      const { data: inventoryItem } = await admin
        .from('household_inventory_items')
        .select('lowStockThreshold')
        .eq('id', item.inventoryItemId)
        .maybeSingle();
      if (inventoryItem) {
        await admin
          .from('household_inventory_items')
          .update({ quantity: inventoryItem.lowStockThreshold + 1, status: 'in_stock' })
          .eq('id', item.inventoryItemId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('check shopping list item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
