// app/api/adminlog/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isAppId } from '@/lib/appMode';

const EDITABLE_FIELDS = ['username', 'firstName', 'lastName', 'isAdmin', 'isTestAccount', 'aiEnabled', 'enabledApps'] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.from('profiles').select('*').eq('id', id).single();

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const caller = await requireAdminCaller(supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS as readonly EditableField[]) {
    if (!(field in body)) continue;
    update[field] = body[field];
  }

  if ('enabledApps' in update) {
    if (!Array.isArray(update.enabledApps) || !update.enabledApps.every((v) => typeof v === 'string' && isAppId(v))) {
      return NextResponse.json({ error: 'enabledApps must be an array of valid app ids' }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.from('profiles').update(update).eq('id', id).select().single();

  if (error || !data) {
    console.error('adminlog user PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
