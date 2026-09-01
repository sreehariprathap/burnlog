import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface CheckoutBody {
  sellerId?: string;
  paymentId?: string;
}

export async function POST(request: Request) {
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

    const { sellerId, paymentId } = (await request.json()) as CheckoutBody;
    if (!sellerId || !paymentId) {
      return NextResponse.json({ error: 'sellerId and paymentId are required' }, { status: 400 });
    }

    // The payment must exist, belong to this buyer, and be made out to this
    // exact seller — a caller can't reuse someone else's payment or point a
    // payment at a different seller than the one it was made to.
    const { data: payment } = await admin
      .from('payments')
      .select('id, payerId, payeeId, amount')
      .eq('id', paymentId)
      .single();
    if (!payment || payment.payerId !== meId || payment.payeeId !== sellerId) {
      return NextResponse.json({ error: 'Payment does not match this checkout' }, { status: 403 });
    }

    // Idempotency: a payment can only ever back one order.
    const { data: existingOrder } = await admin
      .from('shop_orders')
      .select('id')
      .eq('paymentId', paymentId)
      .maybeSingle();
    if (existingOrder) {
      return NextResponse.json({ error: 'This payment has already been used for an order' }, { status: 409 });
    }

    const { data: cartRows } = await admin
      .from('shop_cart_items')
      .select('id, quantity, listing:shop_listings(id, title, price, "stockQuantity", status, sellerId)')
      .eq('profileId', meId);

    type CartRow = {
      id: string;
      quantity: number;
      listing: { id: string; title: string; price: number; stockQuantity: number; status: string; sellerId: string } | null;
    };

    const sellerItems = ((cartRows ?? []) as unknown as CartRow[]).filter(
      (r) =>
        r.listing !== null &&
        r.listing.sellerId === sellerId &&
        r.listing.status === 'active' &&
        r.listing.stockQuantity >= r.quantity
    );

    if (sellerItems.length === 0) {
      return NextResponse.json({ error: 'No purchasable items from this seller in your cart' }, { status: 400 });
    }

    const totalAmount = sellerItems.reduce((sum, i) => sum + i.listing!.price * i.quantity, 0);
    if (Math.abs(totalAmount - payment.amount) > 0.01) {
      return NextResponse.json({ error: 'Cart changed since payment — amounts no longer match' }, { status: 409 });
    }

    const { data: order, error: orderError } = await admin
      .from('shop_orders')
      .insert({ buyerId: meId, sellerId, totalAmount, paymentId })
      .select('id')
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? 'Failed to create order' }, { status: 400 });
    }

    await admin.from('shop_order_items').insert(
      sellerItems.map((i) => ({
        orderId: order.id,
        listingId: i.listing!.id,
        title: i.listing!.title,
        price: i.listing!.price,
        quantity: i.quantity,
      }))
    );

    for (const i of sellerItems) {
      const remaining = i.listing!.stockQuantity - i.quantity;
      await admin
        .from('shop_listings')
        .update({ stockQuantity: remaining, status: remaining <= 0 ? 'sold' : 'active' })
        .eq('id', i.listing!.id);
    }

    await admin
      .from('shop_cart_items')
      .delete()
      .in('id', sellerItems.map((i) => i.id));

    return NextResponse.json({ order: { id: order.id, sellerId, totalAmount } });
  } catch (error) {
    console.error('shoppinglog checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
