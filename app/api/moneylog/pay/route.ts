import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getBalance } from '@/lib/moneylog/balance';

type Admin = ReturnType<typeof createServiceRoleClient>;

async function getMyProfileId(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('id').eq('userId', userId).single();
  return data?.id as string | undefined;
}

interface PayRequestBody {
  payeeId?: string;
  amount?: number;
  category?: string;
  memo?: string;
  sourceApp?: string;
}

export async function POST(request: Request) {
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

    const body = (await request.json()) as PayRequestBody;
    const { payeeId, amount, category, memo, sourceApp } = body;

    if (!payeeId || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'payeeId and a positive amount are required' }, { status: 400 });
    }
    if (!category || !sourceApp) {
      return NextResponse.json({ error: 'category and sourceApp are required' }, { status: 400 });
    }
    if (payeeId === meId) {
      return NextResponse.json({ error: 'Cannot pay yourself' }, { status: 400 });
    }

    const { data: me } = await admin.from('profiles').select('username').eq('id', meId).single();
    const { data: payee } = await admin.from('profiles').select('id, username').eq('id', payeeId).single();
    if (!payee) {
      return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
    }

    // No DB transaction here — see the "Global Constraints" note on this
    // codebase's existing convention of sequential (non-transactional)
    // writes for money-moving operations. This check-then-insert has a
    // narrow theoretical race window under truly concurrent payments from
    // the same profile.
    const balance = await getBalance(admin, meId);
    if (amount > balance) {
      return NextResponse.json({ error: 'insufficient_funds', balance }, { status: 409 });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({ payerId: meId, payeeId, amount, sourceApp, category, memo: memo ?? null })
      .select('id')
      .single();
    if (paymentError || !payment) {
      return NextResponse.json({ error: paymentError?.message ?? 'Failed to create payment' }, { status: 400 });
    }

    await admin.from('finance_transactions').insert([
      {
        profileId: meId,
        type: 'expense',
        category,
        label: memo ? `Payment to @${payee.username}: ${memo}` : `Payment to @${payee.username}`,
        amount,
        paymentId: payment.id,
      },
      {
        profileId: payeeId,
        type: 'income',
        category,
        label: memo ? `Payment from @${me?.username ?? 'someone'}: ${memo}` : `Payment from @${me?.username ?? 'someone'}`,
        amount,
        paymentId: payment.id,
      },
    ]);

    return NextResponse.json({ paymentId: payment.id, balance: balance - amount });
  } catch (error) {
    console.error('moneylog pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
