// app/api/moneylog/assets/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isAssetCategory } from '@/lib/moneylog/assetCategories';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

async function loadOwnedAsset(admin: Admin, meId: string, assetId: string) {
  const { data } = await admin.from('assets').select('id, profileId').eq('id', assetId).single();
  if (!data || data.profileId !== meId) return null;
  return data;
}

interface PatchBody {
  name?: string;
  category?: string;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { name, category } = (await request.json()) as PatchBody;
    const update: { name?: string; category?: string } = {};
    if (name !== undefined) {
      if (name.trim().length === 0) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      update.name = name.trim();
    }
    if (category !== undefined) {
      if (!isAssetCategory(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      update.category = category;
    }

    if (Object.keys(update).length > 0) {
      await admin.from('assets').update(update).eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('moneylog asset PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const asset = await loadOwnedAsset(admin, meId, id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Idempotent: archiving an already-archived asset just re-sets the same field.
    await admin.from('assets').update({ archivedAt: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('moneylog asset DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
