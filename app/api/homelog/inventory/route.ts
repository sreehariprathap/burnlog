import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

const VALID_CATEGORIES = ['pantry', 'household', 'other'];

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
      .from('household_inventory_items')
      .select('*')
      .eq('householdId', membership.householdId)
      .order('createdAt', { ascending: true });

    return NextResponse.json({ items: items ?? [] });
  } catch (error) {
    console.error('list inventory error:', error);
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

    const body = (await request.json()) as {
      name?: string;
      category?: string;
      quantity?: number;
      lowStockThreshold?: number;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    const quantity = Number.isFinite(body.quantity) ? Math.max(0, Math.floor(body.quantity as number)) : 1;
    const lowStockThreshold = Number.isFinite(body.lowStockThreshold)
      ? Math.max(0, Math.floor(body.lowStockThreshold as number))
      : 1;

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const status = quantity <= 0 ? 'out' : quantity <= lowStockThreshold ? 'low' : 'in_stock';

    const { data: item, error: insertError } = await admin
      .from('household_inventory_items')
      .insert([
        {
          householdId: membership.householdId,
          name: body.name.trim(),
          category: body.category,
          quantity,
          lowStockThreshold,
          status,
        },
      ])
      .select()
      .single();
    if (insertError || !item) {
      return NextResponse.json({ error: insertError?.message || 'Failed to add item' }, { status: 400 });
    }

    if (status !== 'in_stock') {
      await admin.from('household_shopping_list_items').insert([
        {
          householdId: membership.householdId,
          inventoryItemId: item.id,
          label: item.name,
          addedByProfileId: meId,
        },
      ]);
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('create inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
