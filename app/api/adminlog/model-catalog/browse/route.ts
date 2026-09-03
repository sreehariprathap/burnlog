// app/api/adminlog/model-catalog/browse/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { getBrowsableModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const models = await getBrowsableModelsList();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('model-catalog browse GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
