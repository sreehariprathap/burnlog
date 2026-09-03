// app/api/moneylog/assets/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isAssetCategory } from '@/lib/moneylog/assetCategories';
import { isSipFrequency } from '@/lib/moneylog/sipFrequency';

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

    const { data: asset, error } = await admin
      .from('assets')
      .select('id, profileId, name, category, investedValue, expectedGrowthRate, sipEnabled, sipAmount, sipFrequency, asset_balance_entries(value, date)')
      .eq('id', id)
      .single();
    if (error || !asset || asset.profileId !== meId) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const entries = (asset as unknown as { asset_balance_entries: { value: number; date: string }[] }).asset_balance_entries;
    const value = entries.length > 0 ? entries.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a)).value : 0;
    const unrealizedIncome = asset.investedValue != null ? value - asset.investedValue : null;

    return NextResponse.json({
      asset: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        value,
        investedValue: asset.investedValue,
        unrealizedIncome,
        expectedGrowthRate: asset.expectedGrowthRate,
        sipEnabled: asset.sipEnabled,
        sipAmount: asset.sipAmount,
        sipFrequency: asset.sipFrequency,
      },
    });
  } catch (error) {
    console.error('moneylog asset GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PatchBody {
  name?: string;
  category?: string;
  investedValue?: number | null;
  expectedGrowthRate?: number | null;
  sipEnabled?: boolean;
  sipAmount?: number | null;
  sipFrequency?: string | null;
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

    const { name, category, investedValue, expectedGrowthRate, sipEnabled, sipAmount, sipFrequency } =
      (await request.json()) as PatchBody;
    const update: {
      name?: string;
      category?: string;
      investedValue?: number | null;
      expectedGrowthRate?: number | null;
      sipEnabled?: boolean;
      sipAmount?: number | null;
      sipFrequency?: string | null;
    } = {};
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
    if (investedValue !== undefined) {
      if (investedValue !== null && (typeof investedValue !== 'number' || !Number.isFinite(investedValue) || investedValue < 0)) {
        return NextResponse.json({ error: 'investedValue must be a non-negative number' }, { status: 400 });
      }
      update.investedValue = investedValue;
    }
    if (expectedGrowthRate !== undefined) {
      if (expectedGrowthRate !== null && (typeof expectedGrowthRate !== 'number' || !Number.isFinite(expectedGrowthRate))) {
        return NextResponse.json({ error: 'expectedGrowthRate must be a number' }, { status: 400 });
      }
      update.expectedGrowthRate = expectedGrowthRate;
    }
    if (sipEnabled !== undefined) {
      if (sipEnabled && (typeof sipAmount !== 'number' || !Number.isFinite(sipAmount) || sipAmount <= 0 || !sipFrequency || !isSipFrequency(sipFrequency))) {
        return NextResponse.json({ error: 'A valid SIP amount and frequency are required when SIP is enabled' }, { status: 400 });
      }
      update.sipEnabled = sipEnabled;
      update.sipAmount = sipEnabled ? (sipAmount as number) : null;
      update.sipFrequency = sipEnabled ? (sipFrequency as string) : null;
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
