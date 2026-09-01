import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';

const VALID_FREQUENCIES = ['once', 'weekly', 'monthly', 'yearly'];
const VALID_CATEGORIES = ['cleaning', 'maintenance', 'other'];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: chores } = await admin
      .from('household_chores')
      .select('*')
      .eq('householdId', membership.householdId)
      .eq('isActive', true)
      .order('createdAt', { ascending: true });

    if (!chores || chores.length === 0) {
      return NextResponse.json({ chores: [] });
    }

    const choreIds = chores.map((c) => c.id);
    const { data: openInstances } = await admin
      .from('household_chore_instances')
      .select('*')
      .in('choreId', choreIds)
      .is('completedAt', null)
      .order('dueDate', { ascending: true });

    const { data: members } = await admin
      .from('household_members')
      .select('profileId, joinedAt')
      .eq('householdId', membership.householdId)
      .order('joinedAt', { ascending: true });

    // Safety net: a chore should always have an open instance once created,
    // but backfill one (assigned to the first member) if it's ever missing.
    const choresMissingInstance = chores.filter((c) => !openInstances?.some((i) => i.choreId === c.id));
    const createdInstances: { id: string; choreId: string; dueDate: string; assignedProfileId: string | null }[] = [];
    for (const chore of choresMissingInstance) {
      const assignee = members?.[0]?.profileId ?? null;
      const { data: created } = await admin
        .from('household_chore_instances')
        .insert([{ choreId: chore.id, dueDate: new Date().toISOString().slice(0, 10), assignedProfileId: assignee }])
        .select()
        .single();
      if (created) createdInstances.push(created);
    }

    const allOpenInstances = [...(openInstances ?? []), ...createdInstances];

    const profileIds = [...new Set(allOpenInstances.map((i) => i.assignedProfileId).filter(Boolean))] as string[];
    const { data: profiles } = profileIds.length
      ? await admin.from('profiles').select('id, firstName').in('id', profileIds)
      : { data: [] as { id: string; firstName: string }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const result = chores.map((chore) => {
      const instance = allOpenInstances.find((i) => i.choreId === chore.id) ?? null;
      return {
        id: chore.id,
        title: chore.title,
        category: chore.category,
        frequency: chore.frequency,
        instance: instance
          ? {
              id: instance.id,
              dueDate: instance.dueDate,
              assignedProfileId: instance.assignedProfileId,
              assignedName: instance.assignedProfileId
                ? profileById.get(instance.assignedProfileId)?.firstName ?? 'Unknown'
                : null,
            }
          : null,
      };
    });

    return NextResponse.json({ chores: result });
  } catch (error) {
    console.error('list chores error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as {
      title?: string;
      category?: string;
      frequency?: string;
      dayOfWeek?: number | null;
      dayOfMonth?: number | null;
      monthOfYear?: number | null;
      dueDate?: string;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }
    if (!body.dueDate) {
      return NextResponse.json({ error: 'dueDate is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const meId = await getMyProfileId(admin, user.id);
    if (!meId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const membership = await getMyHouseholdMembership(admin, meId);
    if (!membership) {
      return NextResponse.json({ error: 'Not in a household' }, { status: 400 });
    }

    const { data: chore, error: insertChoreError } = await admin
      .from('household_chores')
      .insert([
        {
          householdId: membership.householdId,
          title: body.title.trim(),
          category: body.category,
          frequency: body.frequency,
          dayOfWeek: body.dayOfWeek ?? null,
          dayOfMonth: body.dayOfMonth ?? null,
          monthOfYear: body.monthOfYear ?? null,
        },
      ])
      .select()
      .single();
    if (insertChoreError || !chore) {
      return NextResponse.json({ error: insertChoreError?.message || 'Failed to create chore' }, { status: 400 });
    }

    const { data: instance, error: insertInstanceError } = await admin
      .from('household_chore_instances')
      .insert([{ choreId: chore.id, dueDate: body.dueDate, assignedProfileId: meId }])
      .select()
      .single();
    if (insertInstanceError) {
      await admin.from('household_chores').delete().eq('id', chore.id);
      return NextResponse.json({ error: insertInstanceError.message }, { status: 400 });
    }

    return NextResponse.json({ chore, instance });
  } catch (error) {
    console.error('create chore error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
