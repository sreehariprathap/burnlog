// app/api/ai/models/route.ts
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

    const toEntry = (m: (typeof models)[number]) => ({ id: m.id, name: m.name, isFree: m.isFree });
    const text = models.filter((m) => m.modality === 'text').map(toEntry);
    const vision = models.filter((m) => m.modality === 'vision').map(toEntry);

    return NextResponse.json({ text, vision });
  } catch (error) {
    console.error('models catalog error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
