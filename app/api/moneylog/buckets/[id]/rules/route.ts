// app/api/moneylog/buckets/[id]/rules/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bucketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket } = await admin.from('savings_buckets').select('profileId').eq('id', bucketId).single();
    if (!bucket || bucket.profileId !== meId) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

    const { data: rules, error } = await admin
      .from('bucket_allocation_rules')
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt, recurringItem:recurring_items(label)')
      .eq('bucketId', bucketId)
      .order('createdAt', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ rules: rules ?? [] });
  } catch (error) {
    console.error('moneylog bucket rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateRuleBody {
  recurringItemId?: string;
  mode?: 'fixed_amount' | 'percentage';
  value?: number;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bucketId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket } = await admin.from('savings_buckets').select('profileId').eq('id', bucketId).single();
    if (!bucket || bucket.profileId !== meId) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

    const { recurringItemId, mode, value } = (await request.json()) as CreateRuleBody;
    if (!recurringItemId) return NextResponse.json({ error: 'recurringItemId is required' }, { status: 400 });
    if (mode !== 'fixed_amount' && mode !== 'percentage') {
      return NextResponse.json({ error: "mode must be 'fixed_amount' or 'percentage'" }, { status: 400 });
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 });
    }

    const { data: recurringItem } = await admin
      .from('recurring_items')
      .select('id, profileId, type')
      .eq('id', recurringItemId)
      .single();
    if (!recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }
    if (recurringItem.type !== 'income') {
      return NextResponse.json({ error: 'Allocation rules can only be attached to income recurring items' }, { status: 400 });
    }

    const { data: rule, error } = await admin
      .from('bucket_allocation_rules')
      .insert({ recurringItemId, bucketId, mode, value })
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt')
      .single();
    if (error || !rule) return NextResponse.json({ error: error?.message ?? 'Failed to create rule' }, { status: 400 });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('moneylog bucket rules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
