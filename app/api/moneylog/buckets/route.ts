// app/api/moneylog/buckets/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

type BucketRow = {
  id: string;
  name: string;
  targetAmount: number | null;
  targetDate: string | null;
  createdAt: string;
  entries: { type: string; amount: number }[];
};

function toSummary(row: BucketRow) {
  const balance = computeBucketBalance(row.entries as { type: 'contribution' | 'withdrawal'; amount: number }[]);
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    targetDate: row.targetDate,
    balance,
    progress: computeBucketProgress(balance, row.targetAmount),
    createdAt: row.createdAt,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: rows, error } = await admin
      .from('savings_buckets')
      .select('id, name, targetAmount, targetDate, createdAt, entries:bucket_entries(type, amount)')
      .eq('profileId', meId)
      .is('archivedAt', null)
      .order('createdAt', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const buckets = ((rows ?? []) as unknown as BucketRow[]).map(toSummary);
    return NextResponse.json({ buckets });
  } catch (error) {
    console.error('moneylog buckets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface CreateBucketBody {
  name?: string;
  targetAmount?: number;
  targetDate?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { name, targetAmount, targetDate } = (await request.json()) as CreateBucketBody;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (targetAmount !== undefined && (typeof targetAmount !== 'number' || !Number.isFinite(targetAmount) || targetAmount <= 0)) {
      return NextResponse.json({ error: 'targetAmount must be a positive number' }, { status: 400 });
    }

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .insert({
        profileId: meId,
        name: name.trim(),
        targetAmount: targetAmount ?? null,
        targetDate: targetDate ?? null,
      })
      .select('id, name, targetAmount, targetDate, createdAt')
      .single();

    if (error || !bucket) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create bucket' }, { status: 400 });
    }

    return NextResponse.json({ bucket: toSummary({ ...bucket, entries: [] }) });
  } catch (error) {
    console.error('moneylog buckets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
