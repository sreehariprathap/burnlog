import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { toProfileId, amount } = (await request.json()) as { toProfileId?: string; amount?: number };
    if (!toProfileId) {
      return NextResponse.json({ error: 'toProfileId is required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || (amount as number) <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (toProfileId === meId) {
      return NextResponse.json({ error: "You can't settle up with yourself" }, { status: 400 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: targetMembership } = await admin
      .from('household_members')
      .select('id')
      .eq('householdId', membership.householdId)
      .eq('profileId', toProfileId)
      .maybeSingle();
    if (!targetMembership) {
      return NextResponse.json({ error: 'That person is not in your household' }, { status: 400 });
    }

    const { data: settlement, error: insertError } = await admin
      .from('household_settlements')
      .insert([{ householdId: membership.householdId, fromProfileId: meId, toProfileId, amount }])
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const { data: names, error: namesError } = await admin
      .from('profiles')
      .select('id, firstName')
      .in('id', [meId, toProfileId]);
    if (namesError || !names) {
      console.error('homelog settle-up -> moneylog: failed to look up names:', namesError);
    } else {
      const meName = names.find((p) => p.id === meId)?.firstName ?? 'Someone';
      const toName = names.find((p) => p.id === toProfileId)?.firstName ?? 'Someone';

      const { error: ledgerError } = await admin.from('finance_transactions').insert([
        {
          profileId: meId,
          type: 'expense',
          category: 'debt_payment',
          label: `HomeLog settle-up to ${toName}`,
          amount,
        },
        {
          profileId: toProfileId,
          type: 'income',
          category: 'household_settlement',
          label: `HomeLog settle-up from ${meName}`,
          amount,
        },
      ]);
      if (ledgerError) console.error('homelog settle-up -> moneylog ledger insert failed:', ledgerError);
    }

    return NextResponse.json({ settlement });
  } catch (error) {
    console.error('create settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
