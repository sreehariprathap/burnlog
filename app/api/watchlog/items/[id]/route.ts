// app/api/watchlog/items/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateWatchItem, deleteWatchItem } from '@/lib/watchlog/queries';
import type { WatchItemRow } from '@/lib/watchlog/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const patch = (await request.json()) as Partial<WatchItemRow>;
    if (patch.status === 'completed' && !patch.completedAt) {
      patch.completedAt = new Date().toISOString();
    }

    await updateWatchItem(supabase, id, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('watchlog update item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await deleteWatchItem(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('watchlog delete item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
