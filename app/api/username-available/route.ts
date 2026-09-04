import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isValidUsername } from '@/lib/username';

// Public, unauthenticated by design — mirrors signup itself, which also
// runs before any session exists. Only ever reveals whether one exact
// username string is taken, nothing else.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const candidate = (searchParams.get('u') ?? '').toLowerCase();

  if (!isValidUsername(candidate)) {
    return NextResponse.json({ available: false, reason: 'Must be 3-20 lowercase letters, digits, or underscores' });
  }

  const admin = createServiceRoleClient();
  const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle();

  return NextResponse.json({ available: !data });
}
