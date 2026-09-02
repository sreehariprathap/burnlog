import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  await admin
    .from('adminlog_invites')
    .update({ status: 'signed_up', signedUpAt: new Date().toISOString() })
    .eq('email', email)
    .eq('status', 'pending');

  return NextResponse.json({ ok: true });
}
