import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const categorySlug = searchParams.get('categorySlug')?.trim();
    const condition = searchParams.get('condition');
    const mine = searchParams.get('mine') === '1';

    let query = admin
      .from('shop_listings')
      .select(
        'id, title, price, condition, status, "stockQuantity", "createdAt", category:shop_categories(id, name, slug, icon), seller:profiles(id, username, firstName, avatarUrl), images:shop_listing_images(url, position)'
      )
      .order('createdAt', { ascending: false })
      .limit(100);

    if (mine) {
      query = query.eq('sellerId', meId);
    } else {
      query = query.eq('status', 'active');
    }
    if (categorySlug) {
      const { data: cat } = await admin.from('shop_categories').select('id').eq('slug', categorySlug).maybeSingle();
      if (cat) query = query.eq('categoryId', cat.id);
    }
    if (condition === 'new' || condition === 'used') {
      query = query.eq('condition', condition);
    }
    if (q) {
      query = query.ilike('title', `%${q}%`);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      id: string;
      title: string;
      price: number;
      condition: string;
      status: string;
      stockQuantity: number;
      createdAt: string;
      category: { id: string; name: string; slug: string; icon: string } | null;
      seller: { id: string; username: string; firstName: string; avatarUrl: string | null } | null;
      images: { url: string; position: number }[];
    };

    const listings = (rows ?? []) as unknown as Row[];
    const listingIds = listings.map((l) => l.id);

    const { data: reviewRows } = await admin
      .from('shop_reviews')
      .select('listingId, rating')
      .in('listingId', listingIds.length ? listingIds : ['00000000-0000-0000-0000-000000000000']);

    const ratingByListing = new Map<string, number[]>();
    for (const r of reviewRows ?? []) {
      const list = ratingByListing.get(r.listingId) ?? [];
      list.push(r.rating);
      ratingByListing.set(r.listingId, list);
    }

    const result = listings
      .filter((l) => l.seller !== null)
      .map((l) => {
        const ratings = ratingByListing.get(l.id) ?? [];
        const sortedImages = [...l.images].sort((a, b) => a.position - b.position);
        return {
          id: l.id,
          title: l.title,
          price: l.price,
          condition: l.condition,
          status: l.status,
          stockQuantity: l.stockQuantity,
          createdAt: l.createdAt,
          category: l.category,
          seller: l.seller,
          coverImageUrl: sortedImages[0]?.url ?? null,
          avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
          reviewCount: ratings.length,
        };
      });

    return NextResponse.json({ listings: result });
  } catch (error) {
    console.error('shoppinglog listings GET error:', error);
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
    const { title, description, price, condition, categoryId, stockQuantity, images } = body as {
      title?: string;
      description?: string;
      price?: number;
      condition?: 'new' | 'used';
      categoryId?: string;
      stockQuantity?: number;
      images?: string[];
    };

    if (!title?.trim() || !description?.trim() || !price || price <= 0 || !categoryId) {
      return NextResponse.json({ error: 'title, description, price, and categoryId are required' }, { status: 400 });
    }
    if (condition !== 'new' && condition !== 'used') {
      return NextResponse.json({ error: 'condition must be "new" or "used"' }, { status: 400 });
    }

    const { data: created, error: insertError } = await admin
      .from('shop_listings')
      .insert({
        sellerId: meId,
        categoryId,
        title: title.trim(),
        description: description.trim(),
        price,
        condition,
        stockQuantity: stockQuantity && stockQuantity > 0 ? Math.floor(stockQuantity) : 1,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    if (images?.length) {
      await admin.from('shop_listing_images').insert(
        images.map((url, position) => ({ listingId: created.id, url, position }))
      );
    }

    return NextResponse.json({ id: created.id });
  } catch (error) {
    console.error('shoppinglog listings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
