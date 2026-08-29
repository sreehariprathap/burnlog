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
      .from('shop_favorites')
      .select(
        'listing:shop_listings(id, title, price, condition, status, seller:profiles(id, username), images:shop_listing_images(url, position))'
      )
      .eq('profileId', meId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = {
      listing: {
        id: string;
        title: string;
        price: number;
        condition: string;
        status: string;
        seller: { id: string; username: string } | null;
        images: { url: string; position: number }[];
      } | null;
    };

    const favorites = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.listing !== null)
      .map((r) => {
        const l = r.listing!;
        const sorted = [...l.images].sort((a, b) => a.position - b.position);
        return {
          id: l.id,
          title: l.title,
          price: l.price,
          condition: l.condition,
          status: l.status,
          seller: l.seller,
          coverImageUrl: sorted[0]?.url ?? null,
        };
      });

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('shoppinglog favorites GET error:', error);
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
    const { listingId } = body as { listingId?: string };
    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    }

    const { error } = await admin
      .from('shop_favorites')
      .upsert({ profileId: meId, listingId }, { onConflict: 'profileId,listingId' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('shoppinglog favorites POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
