import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { generateIntelSuggestions, type SuggestionInput } from '@/lib/ai/intelSuggestions';
import { getModel } from '@/lib/ai/modelConfig';
import { runAiJob } from '@/lib/ai/jobs';
import { assembleProfileContext } from '@/lib/intellog/chatContext';

const MIN_HISTORY_DAYS = 7;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const model = await getModel(supabase, 'intel-suggest');

  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, age');
  if (profilesError) {
    console.error('intel-suggest: failed to load profiles', profilesError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let suggestionsWritten = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of profiles ?? []) {
    try {
      const { appContexts, distinctDays } = await assembleProfileContext(supabase, profile.id);
      if (distinctDays < MIN_HISTORY_DAYS) {
        skipped += 1;
        continue;
      }

      const input: SuggestionInput[] = appContexts.map((ctx) => ({
        app: ctx.app,
        kind: ctx.app,
        metrics: ctx.metrics,
        cohort: ctx.cohort,
      }));

      const suggestions = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'intel-suggest', app: 'intellog', model },
        input,
        (signal) => generateIntelSuggestions(input, model, signal)
      );

      for (const suggestion of suggestions) {
        const { error } = await supabase.from('intel_suggestions').insert({
          profileId: profile.id,
          app: suggestion.app,
          kind: suggestion.kind,
          title: suggestion.title,
          body: suggestion.body,
          deepLink: suggestion.deepLink,
          status: 'new',
        });
        if (error) throw error;
        suggestionsWritten += 1;
      }
    } catch (err) {
      console.error(`intel-suggest: failed for profile ${profile.id}:`, err);
      errors += 1;
    }
  }

  return NextResponse.json({ profilesProcessed: (profiles ?? []).length, suggestionsWritten, skipped, errors });
}
