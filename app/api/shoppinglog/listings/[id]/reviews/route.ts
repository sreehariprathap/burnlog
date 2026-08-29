import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: listingId } = await params;
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

    const body = await request.json();
    const { rating, body: text } = body as { rating?: number; body?: string };
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be 1-5' }, { status: 400 });
    }

    const { data: orderItems } = await admin
      .from('shop_order_items')
      .select('id, order:shop_orders(buyerId)')
      .eq('listingId', listingId);

    const purchased = ((orderItems ?? []) as unknown as { order: { buyerId: string } | null }[]).some(
      (oi) => oi.order?.buyerId === meId
    );
    if (!purchased) {
      return NextResponse.json({ error: 'You can only review items you have purchased' }, { status: 403 });
    }

    const { data: created, error } = await admin
      .from('shop_reviews')
      .insert({ listingId, reviewerId: meId, rating, body: text?.trim() || null })
      .select('id, rating, body, createdAt')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already reviewed this item' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(created);
  } catch (error) {
    console.error('shoppinglog review POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
