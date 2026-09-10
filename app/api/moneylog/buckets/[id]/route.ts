// app/api/moneylog/buckets/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .select('id, name, targetAmount, targetDate, createdAt, profileId, entries:bucket_entries(id, type, amount, note, source, createdAt)')
      .eq('id', id)
      .single();

    if (error || !bucket || bucket.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const entries = (bucket.entries as { type: string; amount: number }[]) ?? [];
    const balance = computeBucketBalance(entries as { type: 'contribution' | 'withdrawal'; amount: number }[]);

    return NextResponse.json({
      bucket: {
        id: bucket.id,
        name: bucket.name,
        targetAmount: bucket.targetAmount,
        targetDate: bucket.targetDate,
        balance,
        progress: computeBucketProgress(balance, bucket.targetAmount),
        createdAt: bucket.createdAt,
      },
      entries: bucket.entries,
    });
  } catch (error) {
    console.error('moneylog bucket GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface UpdateBucketBody {
  name?: string;
  targetAmount?: number | null;
  targetDate?: string | null;
  archive?: boolean;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: existing } = await admin.from('savings_buckets').select('profileId').eq('id', id).single();
    if (!existing || existing.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const body = (await request.json()) as UpdateBucketBody;
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (body.targetAmount !== undefined) update.targetAmount = body.targetAmount;
    if (body.targetDate !== undefined) update.targetDate = body.targetDate;
    if (body.archive) update.archivedAt = new Date().toISOString();

    const { data: bucket, error } = await admin
      .from('savings_buckets')
      .update(update)
      .eq('id', id)
      .select('id, name, targetAmount, targetDate, createdAt, entries:bucket_entries(type, amount)')
      .single();

    if (error || !bucket) {
      return NextResponse.json({ error: error?.message ?? 'Failed to update bucket' }, { status: 400 });
    }

    const entries = (bucket.entries as { type: 'contribution' | 'withdrawal'; amount: number }[]) ?? [];
    const balance = computeBucketBalance(entries);

    return NextResponse.json({
      bucket: {
        id: bucket.id,
        name: bucket.name,
        targetAmount: bucket.targetAmount,
        targetDate: bucket.targetDate,
        balance,
        progress: computeBucketProgress(balance, bucket.targetAmount),
        createdAt: bucket.createdAt,
      },
    });
  } catch (error) {
    console.error('moneylog bucket PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
