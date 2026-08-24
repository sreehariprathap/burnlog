import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { isValidUsername } from '@/lib/username';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const u = (searchParams.get('u') ?? '').toLowerCase();

    if (!isValidUsername(u)) {
      return NextResponse.json({ available: false, error: 'Usernames are 3-20 lowercase letters, digits, or underscores' });
    }

    const admin = createServiceRoleClient();
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('username', u)
      .maybeSingle();

    const isOwnCurrentUsername =
      !!existing &&
      (await admin.from('profiles').select('userId').eq('id', existing.id).single()).data?.userId === user.id;

    return NextResponse.json({ available: !existing || isOwnCurrentUsername });
  } catch (error) {
    console.error('username-available error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
