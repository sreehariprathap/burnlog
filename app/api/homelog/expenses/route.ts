import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

const VALID_CATEGORIES = ['rent', 'utilities', 'groceries', 'other'];

const CATEGORY_MAP: Record<string, string> = {
  rent: 'rent',
  utilities: 'utilities',
  groceries: 'groceries',
  other: 'other_expense',
};

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

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: expenses } = await admin
      .from('household_expenses')
      .select('id, paidByProfileId, label, category, totalAmount, date, createdAt')
      .eq('householdId', membership.householdId)
      .order('date', { ascending: false });

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ expenses: [] });
    }

    const expenseIds = expenses.map((e) => e.id);
    const { data: splits } = await admin
      .from('household_expense_splits')
      .select('id, expenseId, profileId, shareAmount')
      .in('expenseId', expenseIds);

    const profileIds = [...new Set([...expenses.map((e) => e.paidByProfileId), ...(splits ?? []).map((s) => s.profileId)])];
    const { data: profiles } = await admin.from('profiles').select('id, firstName').in('id', profileIds);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const result = expenses.map((expense) => ({
      ...expense,
      paidByName: profileById.get(expense.paidByProfileId)?.firstName ?? 'Unknown',
      splits: (splits ?? [])
        .filter((s) => s.expenseId === expense.id)
        .map((s) => ({ profileId: s.profileId, name: profileById.get(s.profileId)?.firstName ?? 'Unknown', shareAmount: s.shareAmount })),
    }));

    return NextResponse.json({ expenses: result });
  } catch (error) {
    console.error('list expenses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as {
      label?: string;
      category?: string;
      totalAmount?: number;
      splits?: { profileId: string; shareAmount: number }[];
    };

    if (!body.label?.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!Number.isFinite(body.totalAmount) || (body.totalAmount as number) <= 0) {
      return NextResponse.json({ error: 'totalAmount must be a positive number' }, { status: 400 });
    }
    if (!body.splits || body.splits.length === 0) {
      return NextResponse.json({ error: 'At least one split is required' }, { status: 400 });
    }

    const splitSum = body.splits.reduce((sum, s) => sum + s.shareAmount, 0);
    if (Math.abs(splitSum - (body.totalAmount as number)) > 0.01) {
      return NextResponse.json({ error: 'Splits must sum to the total amount' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: members } = await admin
      .from('household_members')
      .select('profileId')
      .eq('householdId', membership.householdId);
    const memberIds = new Set((members ?? []).map((m) => m.profileId));
    if (!body.splits.every((s) => memberIds.has(s.profileId))) {
      return NextResponse.json({ error: 'A split references someone outside this household' }, { status: 400 });
    }

    const { data: expense, error: insertExpenseError } = await admin
      .from('household_expenses')
      .insert([
        {
          householdId: membership.householdId,
          paidByProfileId: meId,
          label: body.label.trim(),
          category: body.category,
          totalAmount: body.totalAmount,
        },
      ])
      .select()
      .single();
    if (insertExpenseError || !expense) {
      return NextResponse.json({ error: insertExpenseError?.message || 'Failed to create expense' }, { status: 400 });
    }

    const { error: insertSplitsError } = await admin.from('household_expense_splits').insert(
      body.splits.map((s) => ({ expenseId: expense.id, profileId: s.profileId, shareAmount: s.shareAmount }))
    );
    if (insertSplitsError) {
      await admin.from('household_expenses').delete().eq('id', expense.id);
      return NextResponse.json({ error: insertSplitsError.message }, { status: 400 });
    }

    const { error: ledgerError } = await admin.from('finance_transactions').insert({
      profileId: meId,
      type: 'expense',
      category: CATEGORY_MAP[body.category as string] ?? 'other_expense',
      label: `HomeLog: ${body.label.trim()}`,
      amount: body.totalAmount,
    });
    if (ledgerError) console.error('homelog bill -> moneylog ledger insert failed:', ledgerError);

    return NextResponse.json({ expense });
  } catch (error) {
    console.error('create expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
