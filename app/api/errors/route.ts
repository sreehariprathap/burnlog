import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/errorLog';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { message, stack, context } = body as {
    message?: string;
    stack?: string;
    context?: Record<string, unknown>;
  };

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  await logError('client', new Error(message), { ...context, stack, userId: user.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}
