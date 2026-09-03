// app/api/intellog/chat/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { listCuratedModels } from '@/lib/ai/curatedModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const models = await listCuratedModels(admin);
    return NextResponse.json({ models });
  } catch (error) {
    console.error('intellog chat models GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
