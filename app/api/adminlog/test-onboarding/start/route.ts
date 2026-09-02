// app/api/adminlog/test-onboarding/start/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller, TEST_ONBOARDING_EMAIL } from '@/lib/adminlog/testOnboarding';

export async function POST() {
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();

  // Ensure the test auth account exists (idempotent).
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  let testUserId = existingUsers?.users.find((u) => u.email === TEST_ONBOARDING_EMAIL)?.id;

  if (!testUserId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: TEST_ONBOARDING_EMAIL,
      email_confirm: true,
    });
    if (createError || !created.user) {
      console.error('test-onboarding/start: failed to create test user', createError);
      return NextResponse.json({ error: 'Failed to create test account' }, { status: 500 });
    }
    testUserId = created.user.id;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_ONBOARDING_EMAIL,
  });
  if (linkError || !link) {
    console.error('test-onboarding/start: failed to generate link', linkError);
    return NextResponse.json({ error: 'Failed to start test session' }, { status: 500 });
  }

  return NextResponse.json({ tokenHash: link.properties.hashed_token });
}
