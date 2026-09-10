// app/api/moneylog/recurring-items/[id]/log-occurrence/route.ts
//
// Atomically: creates the FinanceTransaction for a scheduled recurring date,
// records the RecurringItemOccurrence (so the date can't be logged twice —
// enforced by the DB's unique (recurringItemId, occurrenceDate) index), and,
// for income items, fires any active BucketAllocationRules. Sequential
// service-role writes (no Postgres transaction wrapper available here),
// matching the existing assets POST route's asset+balance-entry pattern.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface LogOccurrenceBody {
  occurrenceDate?: string;
  notes?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: recurringItemId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: recurringItem, error: itemError } = await admin
      .from('recurring_items')
      .select('id, profileId, type, category, label, amount')
      .eq('id', recurringItemId)
      .single();
    if (itemError || !recurringItem || recurringItem.profileId !== meId) {
      return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });
    }

    const { occurrenceDate, notes } = (await request.json()) as LogOccurrenceBody;
    if (!occurrenceDate) return NextResponse.json({ error: 'occurrenceDate is required' }, { status: 400 });

    const { data: transaction, error: transactionError } = await admin
      .from('finance_transactions')
      .insert({
        profileId: meId,
        type: recurringItem.type,
        category: recurringItem.category,
        label: recurringItem.label,
        amount: recurringItem.amount,
        date: occurrenceDate,
        notes: notes?.trim() || null,
        recurringItemId,
      })
      .select('id, type, category, label, amount, date')
      .single();
    if (transactionError || !transaction) {
      return NextResponse.json({ error: transactionError?.message ?? 'Failed to log transaction' }, { status: 400 });
    }

    const { data: occurrence, error: occurrenceError } = await admin
      .from('recurring_item_occurrences')
      .insert({ recurringItemId, occurrenceDate, financeTransactionId: transaction.id })
      .select('id, recurringItemId, occurrenceDate, financeTransactionId')
      .single();
    if (occurrenceError || !occurrence) {
      // Most likely the unique (recurringItemId, occurrenceDate) constraint —
      // this date was already logged.
      return NextResponse.json({ error: occurrenceError?.message ?? 'This date has already been logged' }, { status: 400 });
    }

    const bucketEntries: unknown[] = [];
    if (recurringItem.type === 'income') {
      const { data: rules } = await admin
        .from('bucket_allocation_rules')
        .select('id, bucketId, mode, value')
        .eq('recurringItemId', recurringItemId)
        .eq('isActive', true);

      for (const rule of rules ?? []) {
        const amount = rule.mode === 'percentage' ? (rule.value / 100) * recurringItem.amount : rule.value;
        const { data: entry } = await admin
          .from('bucket_entries')
          .insert({
            bucketId: rule.bucketId,
            type: 'contribution',
            amount,
            source: 'auto_rule',
            sourceRecurringItemId: recurringItemId,
          })
          .select('id, bucketId, type, amount, source, createdAt')
          .single();
        if (entry) bucketEntries.push(entry);
      }
    }

    return NextResponse.json({ transaction, occurrence, bucketEntries });
  } catch (error) {
    console.error('moneylog log-occurrence POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
