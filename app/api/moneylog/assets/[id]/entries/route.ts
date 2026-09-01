// app/api/moneylog/assets/[id]/entries/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: entries, error } = await admin
      .from('asset_balance_entries')
      .select('id, value, date, notes')
      .eq('assetId', id)
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ entries: entries ?? [] });
  } catch (error) {
    console.error('moneylog asset entries GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface AddEntryBody {
  value?: number;
  notes?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { value, notes } = (await request.json()) as AddEntryBody;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: 'value must be a non-negative number' }, { status: 400 });
    }

    const { data: entry, error } = await admin
      .from('asset_balance_entries')
      .insert({ assetId: id, value, notes: notes ?? null })
      .select('id, value, date, notes')
      .single();

    if (error || !entry) {
      return NextResponse.json({ error: error?.message ?? 'Failed to record balance' }, { status: 400 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('moneylog asset entries POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
