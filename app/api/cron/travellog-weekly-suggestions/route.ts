import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { sendPushToUser } from '@/lib/pushNotification/server';
import { computeFreeWindows } from '@/lib/travellog/freeTime';
import { fetchUpcomingHolidays } from '@/lib/travellog/holidays';
import {
  buildWeeklySuggestionsSystemPrompt,
  buildWeeklySuggestionsUserPrompt,
  validateWeeklySuggestionsResponse,
  type WeeklySuggestionsRequest,
} from '@/lib/travellog/weeklySuggestions';

const HORIZON_DAYS = 90;

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const model = await getModel(supabase, 'travellog-weekly-suggestions');
  const today = new Date();
  const weekOf = mondayOf(today);
  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
  const fromKey = today.toISOString().slice(0, 10);
  const toKey = horizonEnd.toISOString().slice(0, 10);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, userId, country')
    .eq('weeklyTripSuggestionsEnabled', true)
    .not('country', 'is', null);
  if (profilesError) {
    console.error('travellog-weekly-suggestions: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let profilesProcessed = 0;
  let suggestionsWritten = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles ?? []) {
    profilesProcessed += 1;
    try {
      const [visitsRes, blocksRes, tasksRes, holidays] = await Promise.all([
        supabase
          .from('travellog_visits')
          .select('placeName, country')
          .eq('profileId', profile.id)
          .order('arrivalDate', { ascending: false })
          .limit(20),
        supabase.from('myday_blocks').select('date').eq('profileId', profile.id).gte('date', fromKey).lte('date', toKey),
        supabase.from('tasklog_tasks').select('dueDate, completedAt').eq('profileId', profile.id).gte('dueDate', fromKey).lte('dueDate', toKey),
        fetchUpcomingHolidays(profile.country as string, today, HORIZON_DAYS),
      ]);

      const freeWindows = computeFreeWindows(
        (blocksRes.data as { date: string }[]) || [],
        (tasksRes.data as { dueDate: string | null; completedAt: string | null }[]) || [],
        today,
        HORIZON_DAYS
      );

      if (freeWindows.length === 0) {
        skipped += 1;
        continue;
      }

      const visitedPlaces = ((visitsRes.data as { placeName: string; country: string }[]) || []).map(
        (v) => `${v.placeName}, ${v.country}`
      );

      const req: WeeklySuggestionsRequest = {
        visitedPlaces,
        freeWindows,
        holidays,
        country: profile.country as string,
      };

      const { suggestions } = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'travellog-weekly-suggestions', app: 'travellog', model },
        req,
        async () => {
          const completion = await client.chat.completions.create({
            model,
            temperature: 0.7,
            messages: [
              { role: 'system', content: buildWeeklySuggestionsSystemPrompt() },
              { role: 'user', content: buildWeeklySuggestionsUserPrompt(req) },
            ],
            response_format: { type: 'json_object' },
          });

          const content = completion.choices[0]?.message?.content;
          if (!content) throw new Error('AI returned no response');

          const parsed = JSON.parse(content);
          return validateWeeklySuggestionsResponse(parsed, freeWindows);
        }
      );

      await supabase.from('travellog_weekly_suggestions').delete().eq('profileId', profile.id);

      const { error: insertError } = await supabase.from('travellog_weekly_suggestions').insert(
        suggestions.map((s) => ({
          profileId: profile.id,
          destination: s.destination,
          country: s.country,
          startDate: s.startDate,
          endDate: s.endDate,
          windowLabel: s.windowLabel,
          reason: s.reason,
          weekOf,
        }))
      );
      if (insertError) throw insertError;
      suggestionsWritten += suggestions.length;

      await sendPushToUser(supabase, profile.userId as string, {
        title: 'New trip ideas for this week',
        message: `${suggestions.length} new places to consider for your next trip.`,
        url: '/travellog/suggestions',
      });
    } catch (err) {
      console.error(`travellog-weekly-suggestions: failed for profile ${profile.id}:`, err);
      errors += 1;
    }
  }

  return NextResponse.json({ profilesProcessed, suggestionsWritten, skipped, errors });
}
