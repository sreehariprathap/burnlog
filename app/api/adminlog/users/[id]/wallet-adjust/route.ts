// app/api/adminlog/users/[id]/wallet-adjust/route.ts
//
// Admin credits or debits a user's MoneyLog wallet balance — the same
// computed balance (sum of finance_transactions) that gates real payments
// via PaymentProvider/checkout, so an admin-granted credit is immediately
// spendable in ShoppingLog and anywhere else that calls /api/moneylog/pay.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { getBalance } from '@/lib/moneylog/balance';

interface WalletAdjustBody {
  amount?: number;
  memo?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { amount, memo } = (await req.json()) as WalletAdjustBody;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'A non-zero amount is required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: target } = await admin.from('profiles').select('id').eq('id', id).single();
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const isCredit = amount > 0;
  const { error } = await admin.from('finance_transactions').insert({
    profileId: id,
    type: isCredit ? 'income' : 'expense',
    category: isCredit ? 'other_income' : 'other_expense',
    label: memo?.trim() ? `Admin adjustment: ${memo.trim()}` : 'Admin balance adjustment',
    amount: Math.abs(amount),
  });
  if (error) {
    console.error('wallet-adjust insert error:', error);
    return NextResponse.json({ error: 'Failed to adjust balance' }, { status: 500 });
  }

  const balance = await getBalance(admin, id);
  return NextResponse.json({ balance });
}
