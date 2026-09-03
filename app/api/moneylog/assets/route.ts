// app/api/moneylog/assets/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isAssetCategory, isDebtCategory } from '@/lib/moneylog/assetCategories';
import { isSipFrequency } from '@/lib/moneylog/sipFrequency';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

type AssetRow = {
  id: string;
  name: string;
  category: string;
  investedValue: number | null;
  expectedGrowthRate: number | null;
  sipEnabled: boolean;
  sipAmount: number | null;
  sipFrequency: string | null;
  balanceEntries: { value: number; date: string }[];
};

function latestValue(entries: { value: number; date: string }[]): { value: number; updatedAt: string | null } {
  if (entries.length === 0) return { value: 0, updatedAt: null };
  const latest = entries.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
  return { value: latest.value, updatedAt: latest.date };
}

export async function GET() {
  try {
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

    const { data: rows, error } = await admin
      .from('assets')
      .select('id, name, category, investedValue, expectedGrowthRate, sipEnabled, sipAmount, sipFrequency, balanceEntries:asset_balance_entries(value, date)')
      .eq('profileId', meId)
      .is('archivedAt', null)
      .order('createdAt', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const assets = ((rows ?? []) as unknown as AssetRow[]).map((row) => {
      const { value, updatedAt } = latestValue(row.balanceEntries);
      const unrealizedIncome = row.investedValue != null ? value - row.investedValue : null;
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        value,
        updatedAt,
        investedValue: row.investedValue,
        unrealizedIncome,
        expectedGrowthRate: row.expectedGrowthRate,
        sipEnabled: row.sipEnabled,
        sipAmount: row.sipAmount,
        sipFrequency: row.sipFrequency,
      };
    });

    const netWorth = assets.reduce(
      (sum, a) => sum + (isDebtCategory(a.category) ? -a.value : a.value),
      0
    );

    return NextResponse.json({ assets, netWorth });
  } catch (error) {
    console.error('moneylog assets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateAssetBody {
  name?: string;
  category?: string;
  initialValue?: number;
  investedValue?: number;
  expectedGrowthRate?: number;
  sipEnabled?: boolean;
  sipAmount?: number;
  sipFrequency?: string;
}

export async function POST(request: Request) {
  try {
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

    const { name, category, initialValue, investedValue, expectedGrowthRate, sipEnabled, sipAmount, sipFrequency } =
      (await request.json()) as CreateAssetBody;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!category || !isAssetCategory(category)) {
      return NextResponse.json({ error: 'A valid category is required' }, { status: 400 });
    }
    if (typeof initialValue !== 'number' || !Number.isFinite(initialValue) || initialValue < 0) {
      return NextResponse.json({ error: 'initialValue must be a non-negative number' }, { status: 400 });
    }
    if (investedValue !== undefined && (typeof investedValue !== 'number' || !Number.isFinite(investedValue) || investedValue < 0)) {
      return NextResponse.json({ error: 'investedValue must be a non-negative number' }, { status: 400 });
    }
    if (expectedGrowthRate !== undefined && (typeof expectedGrowthRate !== 'number' || !Number.isFinite(expectedGrowthRate))) {
      return NextResponse.json({ error: 'expectedGrowthRate must be a number' }, { status: 400 });
    }
    if (sipEnabled && (typeof sipAmount !== 'number' || !Number.isFinite(sipAmount) || sipAmount <= 0 || !sipFrequency || !isSipFrequency(sipFrequency))) {
      return NextResponse.json({ error: 'A valid SIP amount and frequency are required when SIP is enabled' }, { status: 400 });
    }

    const { data: asset, error: assetError } = await admin
      .from('assets')
      .insert({
        profileId: meId,
        name: name.trim(),
        category,
        investedValue: investedValue ?? initialValue,
        expectedGrowthRate: expectedGrowthRate ?? null,
        sipEnabled: Boolean(sipEnabled),
        sipAmount: sipEnabled ? sipAmount : null,
        sipFrequency: sipEnabled ? sipFrequency : null,
      })
      .select('id, name, category, investedValue, expectedGrowthRate, sipEnabled, sipAmount, sipFrequency')
      .single();
    if (assetError || !asset) {
      return NextResponse.json({ error: assetError?.message ?? 'Failed to create asset' }, { status: 400 });
    }

    const { data: entry, error: entryError } = await admin
      .from('asset_balance_entries')
      .insert({ assetId: asset.id, value: initialValue })
      .select('date')
      .single();
    if (entryError || !entry) {
      return NextResponse.json({ error: entryError?.message ?? 'Failed to record initial balance' }, { status: 400 });
    }

    return NextResponse.json({
      asset: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        value: initialValue,
        updatedAt: entry.date,
        investedValue: asset.investedValue,
        unrealizedIncome: asset.investedValue != null ? initialValue - asset.investedValue : null,
        expectedGrowthRate: asset.expectedGrowthRate,
        sipEnabled: asset.sipEnabled,
        sipAmount: asset.sipAmount,
        sipFrequency: asset.sipFrequency,
      },
    });
  } catch (error) {
    console.error('moneylog assets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
