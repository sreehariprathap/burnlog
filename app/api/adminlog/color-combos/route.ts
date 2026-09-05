import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { requireAdminCaller } from '@/lib/adminlog/testOnboarding';
import { isValidCssColor } from '@/lib/theme/appTheme';
import { TEMPLATE_COLOR_COMBOS } from '@/lib/theme/colorCombos';

interface ColorComboRow {
  id: string;
  name: string;
  description: string | null;
  primaryLight: string;
  primaryDark: string;
  backgroundLight: string;
  backgroundDark: string;
  isTemplate: boolean;
}

// GET: fetch all combos (templates + user-created)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_color_combos')
      .select('*')
      .order('isTemplate', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('color-combos GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: create a new user-created combo
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, primaryLight, primaryDark, backgroundLight, backgroundDark } =
      body as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const colors = { primaryLight, primaryDark, backgroundLight, backgroundDark };
    for (const [key, value] of Object.entries(colors)) {
      if (!isValidCssColor(value)) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('adminlog_color_combos')
      .insert({
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        primaryLight,
        primaryDark,
        backgroundLight,
        backgroundDark,
        isTemplate: false,
        createdBy: caller.id,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('color-combos POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: edit a user-created combo (not templates)
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, description, primaryLight, primaryDark, backgroundLight, backgroundDark } =
      body as Record<string, unknown>;

    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: existing, error: fetchError } = await admin
      .from('adminlog_color_combos')
      .select('isTemplate')
      .eq('id', id)
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Combo not found' }, { status: 404 });
    }
    if (existing.isTemplate) {
      return NextResponse.json({ error: 'Cannot edit template combos' }, { status: 403 });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const colors = { primaryLight, primaryDark, backgroundLight, backgroundDark };
    for (const [key, value] of Object.entries(colors)) {
      if (!isValidCssColor(value)) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
    }

    const { data, error } = await admin
      .from('adminlog_color_combos')
      .update({
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        primaryLight,
        primaryDark,
        backgroundLight,
        backgroundDark,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('color-combos PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: delete a user-created combo (not templates)
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const caller = await requireAdminCaller(supabase);
    if (!caller) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: existing, error: fetchError } = await admin
      .from('adminlog_color_combos')
      .select('isTemplate')
      .eq('id', id)
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Combo not found' }, { status: 404 });
    }
    if (existing.isTemplate) {
      return NextResponse.json({ error: 'Cannot delete template combos' }, { status: 403 });
    }

    const { error } = await admin
      .from('adminlog_color_combos')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('color-combos DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
