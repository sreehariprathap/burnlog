import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

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

    const { data: me } = await admin.from('profiles').select('username').eq('id', meId).single();

    const { data: cartRows } = await admin
      .from('shop_cart_items')
      .select('id, quantity, listing:shop_listings(id, title, price, "stockQuantity", status, sellerId)')
      .eq('profileId', meId);

    type CartRow = {
      id: string;
      quantity: number;
      listing: { id: string; title: string; price: number; stockQuantity: number; status: string; sellerId: string } | null;
    };

    const validItems = ((cartRows ?? []) as unknown as CartRow[]).filter(
      (r) => r.listing !== null && r.listing.status === 'active' && r.listing.stockQuantity >= r.quantity
    );

    if (validItems.length === 0) {
      return NextResponse.json({ error: 'Your cart has no purchasable items' }, { status: 400 });
    }

    const bySeller = new Map<string, CartRow[]>();
    for (const item of validItems) {
      const sellerId = item.listing!.sellerId;
      const list = bySeller.get(sellerId) ?? [];
      list.push(item);
      bySeller.set(sellerId, list);
    }

    const createdOrders: { id: string; sellerId: string; totalAmount: number }[] = [];

    for (const [sellerId, items] of bySeller.entries()) {
      const totalAmount = items.reduce((sum, i) => sum + i.listing!.price * i.quantity, 0);

      const { data: order, error: orderError } = await admin
        .from('shop_orders')
        .insert({ buyerId: meId, sellerId, totalAmount })
        .select('id')
        .single();
      if (orderError || !order) {
        return NextResponse.json({ error: orderError?.message ?? 'Failed to create order' }, { status: 400 });
      }

      await admin.from('shop_order_items').insert(
        items.map((i) => ({
          orderId: order.id,
          listingId: i.listing!.id,
          title: i.listing!.title,
          price: i.listing!.price,
          quantity: i.quantity,
        }))
      );

      for (const i of items) {
        const remaining = i.listing!.stockQuantity - i.quantity;
        await admin
          .from('shop_listings')
          .update({ stockQuantity: remaining, status: remaining <= 0 ? 'sold' : 'active' })
          .eq('id', i.listing!.id);
      }

      const { data: seller } = await admin.from('profiles').select('username').eq('id', sellerId).single();
      const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

      await admin.from('finance_transactions').insert({
        profileId: meId,
        type: 'expense',
        category: 'shopping',
        label: `ShoppingLog: ${itemCount} item${itemCount === 1 ? '' : 's'} from @${seller?.username ?? 'seller'}`,
        amount: totalAmount,
      });

      await admin.from('finance_transactions').insert({
        profileId: sellerId,
        type: 'income',
        category: 'shopping_sales',
        label: `ShoppingLog: ${itemCount} item${itemCount === 1 ? '' : 's'} sold to @${me?.username ?? 'buyer'}`,
        amount: totalAmount,
      });

      createdOrders.push({ id: order.id, sellerId, totalAmount });
    }

    await admin
      .from('shop_cart_items')
      .delete()
      .in('id', validItems.map((i) => i.id));

    return NextResponse.json({ orders: createdOrders });
  } catch (error) {
    console.error('shoppinglog checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
