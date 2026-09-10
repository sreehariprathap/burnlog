// app/api/moneylog/buckets/[id]/entries/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeBucketBalance, computeBucketProgress } from '@/lib/moneylog/buckets';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface CreateEntryBody {
  type?: 'contribution' | 'withdrawal';
  amount?: number;
  note?: string;
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
    if (!bucket || bucket.profileId !== meId) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
    }

    const { type, amount, note } = (await request.json()) as CreateEntryBody;
    if (type !== 'contribution' && type !== 'withdrawal') {
      return NextResponse.json({ error: "type must be 'contribution' or 'withdrawal'" }, { status: 400 });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const { data: entry, error: entryError } = await admin
      .from('bucket_entries')
      .insert({ bucketId, type, amount, note: note?.trim() || null, source: 'manual' })
      .select('id, type, amount, note, source, createdAt')
      .single();
    if (entryError || !entry) {
      return NextResponse.json({ error: entryError?.message ?? 'Failed to record entry' }, { status: 400 });
    }

    const { data: allEntries } = await admin.from('bucket_entries').select('type, amount').eq('bucketId', bucketId);
    const { data: bucketRow } = await admin.from('savings_buckets').select('id, name, targetAmount, targetDate, createdAt').eq('id', bucketId).single();

    const balance = computeBucketBalance((allEntries ?? []) as { type: 'contribution' | 'withdrawal'; amount: number }[]);

    return NextResponse.json({
      entry,
      bucket: bucketRow
        ? {
            ...bucketRow,
            balance,
            progress: computeBucketProgress(balance, bucketRow.targetAmount),
          }
        : null,
    });
  } catch (error) {
    console.error('moneylog bucket entry POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
