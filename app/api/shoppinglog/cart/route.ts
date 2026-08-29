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

    const { data: rows, error } = await admin
      .from('shop_cart_items')
      .select(
        'id, quantity, listing:shop_listings(id, title, price, "stockQuantity", status, seller:profiles(id, username), images:shop_listing_images(url, position))'
      )
      .eq('profileId', meId)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      id: string;
      quantity: number;
      listing: {
        id: string;
        title: string;
        price: number;
        stockQuantity: number;
        status: string;
        seller: { id: string; username: string } | null;
        images: { url: string; position: number }[];
      } | null;
    };

    const items = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.listing !== null)
      .map((r) => {
        const l = r.listing!;
        const sorted = [...l.images].sort((a, b) => a.position - b.position);
        return {
          cartItemId: r.id,
          quantity: r.quantity,
          listing: {
            id: l.id,
            title: l.title,
            price: l.price,
            stockQuantity: l.stockQuantity,
            status: l.status,
            seller: l.seller,
            coverImageUrl: sorted[0]?.url ?? null,
          },
        };
      });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('shoppinglog cart GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const { listingId, quantity } = body as { listingId?: string; quantity?: number };
    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    }

    const { data: listing } = await admin
      .from('shop_listings')
      .select('id, sellerId, status, stockQuantity')
      .eq('id', listingId)
      .maybeSingle();
    if (!listing || listing.status !== 'active') {
      return NextResponse.json({ error: 'Listing is not available' }, { status: 400 });
    }
    if (listing.sellerId === meId) {
      return NextResponse.json({ error: "You can't buy your own listing" }, { status: 400 });
    }

    const qty = Math.max(1, Math.min(quantity ?? 1, listing.stockQuantity));

    const { error } = await admin
      .from('shop_cart_items')
      .upsert({ profileId: meId, listingId, quantity: qty }, { onConflict: 'profileId,listingId' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('shoppinglog cart POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
