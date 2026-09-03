// app/api/adminlog/model-catalog/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { getBrowsableModelsList } from '@/lib/intellog/openrouterModels';

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('ai_model_catalog')
      .select('id, modelId, name, provider, modality, isFree, contextLength, addedAt')
      .order('addedAt', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ models: data ?? [] });
  } catch (error) {
    console.error('model-catalog GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { modelId } = body as { modelId?: string };
    if (!modelId) {
      return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
    }

    const catalog = await getBrowsableModelsList();
    const found = catalog.find((m) => m.id === modelId);
    if (!found) {
      return NextResponse.json({ error: 'Model not found in the OpenRouter catalog' }, { status: 404 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('ai_model_catalog')
      .upsert(
        {
          modelId: found.id,
          name: found.name,
          provider: found.provider,
          modality: found.modality,
          isFree: found.isFree,
          contextLength: found.contextLength,
          addedByAdminId: caller.id,
        },
        { onConflict: 'modelId' }
      )
      .select('id, modelId, name, provider, modality, isFree, contextLength, addedAt')
      .single();
    if (error) throw error;

    return NextResponse.json({ model: data });
  } catch (error) {
    console.error('model-catalog POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { modelId } = body as { modelId?: string };
    if (!modelId) {
      return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.from('ai_model_catalog').delete().eq('modelId', modelId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('model-catalog DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
