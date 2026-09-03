// app/api/intellog/chat/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const models = await getModelsList();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('intellog chat models GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
