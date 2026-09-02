import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [listingsRes, buyerOrdersRes, sellerOrdersRes] = await Promise.all([
      admin
        .from('shop_listings')
        .select('id', { count: 'exact', head: true })
        .eq('sellerId', meId)
        .eq('status', 'active'),
      admin
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyerId', meId)
        .gte('createdAt', monthStart),
      admin
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('sellerId', meId)
        .gte('createdAt', monthStart),
    ]);

    return NextResponse.json({
      activeListings: listingsRes.count ?? 0,
      ordersThisMonth: (buyerOrdersRes.count ?? 0) + (sellerOrdersRes.count ?? 0),
    });
  } catch (error) {
    console.error('shoppinglog stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
