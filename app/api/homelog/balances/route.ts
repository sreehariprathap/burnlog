import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';
import { computeBalances } from '@/lib/homelog/expenseBalances';

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
      .select('id, paidByProfileId')
      .eq('householdId', membership.householdId);

    const expenseIds = (expenses ?? []).map((e) => e.id);
    const { data: splits } = expenseIds.length
      ? await admin.from('household_expense_splits').select('expenseId, profileId, shareAmount').in('expenseId', expenseIds)
      : { data: [] as { expenseId: string; profileId: string; shareAmount: number }[] };

    const expensesForBalance = (expenses ?? []).map((e) => ({
      paidByProfileId: e.paidByProfileId,
      splits: (splits ?? []).filter((s) => s.expenseId === e.id).map((s) => ({ profileId: s.profileId, shareAmount: s.shareAmount })),
    }));

    const { data: settlements } = await admin
      .from('household_settlements')
      .select('fromProfileId, toProfileId, amount')
      .eq('householdId', membership.householdId);

    const balances = computeBalances(expensesForBalance, settlements ?? []);

    const profileIds = [...new Set(balances.flatMap((b) => [b.memberA, b.memberB]))];
    const { data: profiles } = profileIds.length
      ? await admin.from('profiles').select('id, firstName').in('id', profileIds)
      : { data: [] as { id: string; firstName: string }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const result = balances.map((b) => ({
      memberA: b.memberA,
      memberAName: profileById.get(b.memberA)?.firstName ?? 'Unknown',
      memberB: b.memberB,
      memberBName: profileById.get(b.memberB)?.firstName ?? 'Unknown',
      net: b.net,
    }));

    return NextResponse.json({ balances: result });
  } catch (error) {
    console.error('get balances error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
