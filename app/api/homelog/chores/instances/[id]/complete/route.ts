import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getMyProfileId, getMyHouseholdMembership } from '@/lib/homelog/serverAuth';
import { nextOccurrenceAfter } from '@/lib/homelog/choreRecurrence';
import { sendPushToUser } from '@/lib/pushNotification/server';
import { notifyHouseholdExceptActor } from '@/lib/homelog/notify';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { data: instance, error: fetchError } = await admin
      .from('household_chore_instances')
      .select('id, choreId, dueDate, assignedProfileId, completedAt')
      .eq('id', id)
      .maybeSingle();
    if (fetchError || !instance) {
      return NextResponse.json({ error: 'Chore instance not found' }, { status: 404 });
    }
    if (instance.completedAt) {
      return NextResponse.json({ error: 'Already completed' }, { status: 400 });
    }

    const { data: chore } = await admin
      .from('household_chores')
      .select('id, householdId, title, frequency, dayOfWeek, dayOfMonth, monthOfYear, autoRotate')
      .eq('id', instance.choreId)
      .maybeSingle();
    if (!chore || chore.householdId !== membership.householdId) {
      return NextResponse.json({ error: 'Not your household chore' }, { status: 403 });
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('household_chore_instances')
      .update({ completedAt, completedByProfileId: meId })
      .eq('id', id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Let the rest of the household know this specific person checked it off
    // — best-effort, never fails the completion itself.
    try {
      const { data: me } = await admin.from('profiles').select('firstName, username').eq('id', meId).single();
      const actorName = me?.firstName || me?.username || 'Someone';
      await notifyHouseholdExceptActor(admin, membership.householdId, meId, {
        title: 'Chore done',
        message: chore.title ? `${actorName} marked "${chore.title}" as done` : `${actorName} completed a chore`,
        url: `/homelog/chores?choreId=${chore.id}`,
      });
    } catch (notifyError) {
      console.error('homelog chore completion notify failed:', notifyError);
    }

    // Write-through into TaskLog so this completion shows up in the user's
    // unified task history, tagged "home" — same pattern TravelLog uses to
    // feed tasklog_tasks from acceptTravelPlan (lib/travellog/acceptPlan.ts).
    // Best-effort — TaskLog visibility must never block a chore completion.
    try {
      await admin.from('tasklog_tasks').insert({
        profileId: meId,
        title: chore.title ?? 'Chore',
        category: 'life',
        priority: 'medium',
        lane: 'done',
        completedAt,
        tags: ['home'],
      });
    } catch (taskLogError) {
      console.error('homelog->tasklog write-through failed:', taskLogError);
    }

    const next = nextOccurrenceAfter(chore, new Date(instance.dueDate));
    if (next) {
      // autoRotate: round-robin to the next household member (join order),
      // same behavior every chore has always had. Otherwise carry the same
      // assignee forward — reassigning a chore should stick until someone
      // changes it again, not get silently rotated away.
      let nextAssignee: string | null = instance.assignedProfileId;
      if (chore.autoRotate) {
        const { data: members } = await admin
          .from('household_members')
          .select('profileId')
          .eq('householdId', membership.householdId)
          .order('joinedAt', { ascending: true });

        nextAssignee = members?.[0]?.profileId ?? null;
        if (members && members.length > 0 && instance.assignedProfileId) {
          const currentIndex = members.findIndex((m) => m.profileId === instance.assignedProfileId);
          nextAssignee = members[(currentIndex + 1 + members.length) % members.length].profileId;
        }
      }

      await admin.from('household_chore_instances').insert([
        {
          choreId: chore.id,
          dueDate: next.toISOString().slice(0, 10),
          assignedProfileId: nextAssignee,
        },
      ]);

      // Notify whoever the rotation just landed on — best-effort, and only
      // when it's someone other than the person who just completed it.
      if (nextAssignee && nextAssignee !== meId) {
        try {
          const { data: targetProfile } = await admin
            .from('profiles')
            .select('userId')
            .eq('id', nextAssignee)
            .maybeSingle();
          if (targetProfile?.userId) {
            await sendPushToUser(admin, targetProfile.userId, {
              title: 'Chore assigned to you',
              message: chore.title ? `You were assigned: ${chore.title}` : 'A chore was assigned to you',
              // Deep-links to this chore specifically (see chores/page.tsx's
              // `choreId` search param handling) rather than just the list.
              url: `/homelog/chores?choreId=${chore.id}`,
            });
          }
        } catch (pushError) {
          console.error('homelog chore rotation push send failed:', pushError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('complete chore instance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
