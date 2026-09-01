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

    const { delta } = (await request.json()) as { delta?: number };
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: 'delta must be a non-zero number' }, { status: 400 });
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
      .from('household_inventory_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    if (item.householdId !== membership.householdId) {
      return NextResponse.json({ error: 'Not your household item' }, { status: 403 });
    }

    const newQuantity = Math.max(0, item.quantity + (delta as number));
    const newStatus = newQuantity <= 0 ? 'out' : newQuantity <= item.lowStockThreshold ? 'low' : 'in_stock';

    const { data: updated, error: updateError } = await admin
      .from('household_inventory_items')
      .update({ quantity: newQuantity, status: newStatus })
      .eq('id', id)
      .select()
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (newStatus !== 'in_stock') {
      const { data: existingActive } = await admin
        .from('household_shopping_list_items')
        .select('id')
        .eq('inventoryItemId', id)
        .is('checkedAt', null)
        .maybeSingle();
      if (!existingActive) {
        await admin.from('household_shopping_list_items').insert([
          {
            householdId: membership.householdId,
            inventoryItemId: id,
            label: item.name,
            addedByProfileId: meId,
          },
        ]);
      }
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('adjust inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
