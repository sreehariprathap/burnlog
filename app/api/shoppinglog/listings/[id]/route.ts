import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: listing, error } = await admin
      .from('shop_listings')
      .select(
        'id, title, description, price, condition, status, "stockQuantity", "createdAt", category:shop_categories(id, name, slug, icon), seller:profiles(id, username, firstName, avatarUrl), images:shop_listing_images(url, position)'
      )
      .eq('id', listingId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    type ListingRow = typeof listing & {
      seller: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
      images: { url: string; position: number }[];
    };
    const row = listing as unknown as ListingRow;

    const { data: reviewRows } = await admin
      .from('shop_reviews')
      .select('id, rating, body, "createdAt", reviewer:profiles(id, username, firstName, avatarUrl)')
      .eq('listingId', listingId)
      .order('createdAt', { ascending: false });

    const { data: favoriteRow } = await admin
      .from('shop_favorites')
      .select('id')
      .eq('profileId', meId)
      .eq('listingId', listingId)
      .maybeSingle();

    const ratings = (reviewRows ?? []).map((r) => r.rating);

    return NextResponse.json({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      condition: row.condition,
      status: row.status,
      stockQuantity: row.stockQuantity,
      createdAt: row.createdAt,
      category: row.category,
      seller: row.seller,
      images: [...row.images].sort((a, b) => a.position - b.position).map((i) => i.url),
      reviews: reviewRows ?? [],
      avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      reviewCount: ratings.length,
      isFavorited: !!favoriteRow,
      isOwn: row.seller?.id === meId,
    });
  } catch (error) {
    console.error('shoppinglog listing GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: existing } = await admin.from('shop_listings').select('sellerId').eq('id', listingId).maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    if (existing.sellerId !== meId) {
      return NextResponse.json({ error: 'Not your listing' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, price, condition, categoryId, stockQuantity, status, images } = body as {
      title?: string;
      description?: string;
      price?: number;
      condition?: 'new' | 'used';
      categoryId?: string;
      stockQuantity?: number;
      status?: 'active' | 'sold' | 'removed';
      images?: string[];
    };

    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title.trim();
    if (description !== undefined) update.description = description.trim();
    if (price !== undefined) update.price = price;
    if (condition !== undefined) update.condition = condition;
    if (categoryId !== undefined) update.categoryId = categoryId;
    if (stockQuantity !== undefined) update.stockQuantity = stockQuantity;
    if (status !== undefined) update.status = status;

    if (Object.keys(update).length > 0) {
      const { error } = await admin.from('shop_listings').update(update).eq('id', listingId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    if (images !== undefined) {
      await admin.from('shop_listing_images').delete().eq('listingId', listingId);
      if (images.length > 0) {
        await admin.from('shop_listing_images').insert(images.map((url, position) => ({ listingId, url, position })));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('shoppinglog listing PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
