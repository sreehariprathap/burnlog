// app/api/moneylog/recurring-items/[id]/rules/route.ts
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
    const { id: recurringItemId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: recurringItem } = await admin.from('recurring_items').select('profileId').eq('id', recurringItemId).single();
    if (!recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const { data: rules, error } = await admin
      .from('bucket_allocation_rules')
      .select('id, recurringItemId, bucketId, mode, value, isActive, createdAt, bucket:savings_buckets(name)')
      .eq('recurringItemId', recurringItemId)
      .order('createdAt', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ rules: rules ?? [] });
  } catch (error) {
    console.error('moneylog recurring-item rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
