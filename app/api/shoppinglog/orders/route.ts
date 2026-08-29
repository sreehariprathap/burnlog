import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: purchaseRows, error: purchaseError } = await admin
      .from('shop_orders')
      .select('id, "totalAmount", "createdAt", seller:profiles!shop_orders_sellerId_fkey(id, username, avatarUrl), items:shop_order_items(id, title, price, quantity)')
      .eq('buyerId', meId)
      .order('createdAt', { ascending: false });

    const { data: saleRows, error: saleError } = await admin
      .from('shop_orders')
      .select('id, "totalAmount", "createdAt", buyer:profiles!shop_orders_buyerId_fkey(id, username, avatarUrl), items:shop_order_items(id, title, price, quantity)')
      .eq('sellerId', meId)
      .order('createdAt', { ascending: false });

    if (purchaseError || saleError) {
      return NextResponse.json({ error: (purchaseError ?? saleError)?.message }, { status: 400 });
    }

    return NextResponse.json({ purchases: purchaseRows ?? [], sales: saleRows ?? [] });
  } catch (error) {
    console.error('shoppinglog orders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
