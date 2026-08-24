import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { computeLevel } from '@/lib/leveling';
import { computeConsistencyWeek, getWeekRange } from '@/lib/consistency';

const TABLES_WITH_DATE = ['sessions', 'calorie_burns', 'food_intakes', 'step_entries', 'stamina_sessions', 'weight_entries'] as const;
const METRICS = ['xp', 'streak', 'weekly'] as const;
type Metric = (typeof METRICS)[number];

function toLocalDateString(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const metric = (searchParams.get('metric') ?? 'xp') as Metric;
    if (!METRICS.includes(metric)) {
      return NextResponse.json({ error: 'metric must be one of xp, streak, weekly' }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data: me } = await admin.from('profiles').select('id').eq('userId', user.id).single();
    if (!me) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: rows } = await admin
      .from('friendships')
      .select('requesterId, addresseeId')
      .eq('status', 'accepted')
      .or(`requesterId.eq.${me.id},addresseeId.eq.${me.id}`);

    const profileIds = new Set<string>([me.id]);
    for (const r of rows ?? []) {
      profileIds.add(r.requesterId === me.id ? r.addresseeId : r.requesterId);
    }
    const ids = Array.from(profileIds);

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, firstName, avatarUrl, xp, currentStreak')
      .in('id', ids);

    let valueById = new Map<string, number>();

    if (metric === 'xp') {
      valueById = new Map((profiles ?? []).map((p) => [p.id, p.xp]));
    } else if (metric === 'streak') {
      valueById = new Map((profiles ?? []).map((p) => [p.id, p.currentStreak]));
    } else {
      const { start, end } = getWeekRange();
      const activeDatesByProfile = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));

      await Promise.all(
        TABLES_WITH_DATE.map(async (table) => {
          const { data: dateRows } = await admin
            .from(table)
            .select('profileId, date')
            .in('profileId', ids)
            .gte('date', start.toISOString())
            .lt('date', end.toISOString());
          for (const row of dateRows ?? []) {
            activeDatesByProfile.get(row.profileId)?.add(toLocalDateString(row.date));
          }
        })
      );

      for (const id of ids) {
        const { activeCount } = computeConsistencyWeek(activeDatesByProfile.get(id) ?? new Set());
        valueById.set(id, activeCount);
      }
    }

    const entries = (profiles ?? [])
      .map((p) => ({
        profileId: p.id,
        username: p.username,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        level: computeLevel(p.xp),
        value: valueById.get(p.id) ?? 0,
        isSelf: p.id === me.id,
      }))
      .sort((a, b) => b.value - a.value)
      .map((e, index) => ({ ...e, rank: index + 1 }));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
