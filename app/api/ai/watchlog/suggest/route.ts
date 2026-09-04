// app/api/ai/watchlog/suggest/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/modelConfig';
import { formatAiError } from '@/lib/ai/errors';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';
import { discoverTmdb } from '@/lib/watchlog/tmdb';
import { fetchIgnoredTmdbIds } from '@/lib/watchlog/queries';
import {
  buildSuggestSystemPrompt,
  buildSuggestUserPrompt,
  validateSuggestResponse,
  type SuggestRequest,
} from '@/lib/watchlog/suggestions';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.NEXT_OPENROUTER_KEY,
});

export async function POST(request: Request) {
  let MODEL = 'unknown';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<SuggestRequest>;
    const req: SuggestRequest = {
      moods: Array.isArray(body.moods) ? body.moods : [],
      freeText: body.freeText ?? null,
      likedGenres: Array.isArray(body.likedGenres) ? body.likedGenres : [],
    };

    MODEL = await getModel(supabase, 'watchlog-suggest');

    const { data: profile } = await supabase.from('profiles').select('id').eq('userId', user.id).single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'watchlog-suggest', app: 'watchlog', model: MODEL },
        req,
        async (signal) => {
          let filters;
          try {
            const completion = await client.chat.completions.create({
              model: MODEL,
              temperature: 0.7,
              messages: [
                { role: 'system', content: buildSuggestSystemPrompt() },
                { role: 'user', content: buildSuggestUserPrompt(req) },
              ],
              response_format: { type: 'json_object' },
            }, { signal });

            const content = completion.choices?.[0]?.message?.content;
            if (!content) throw new Error('empty AI response');
            filters = validateSuggestResponse(JSON.parse(content));
          } catch (aiErr) {
            // Graceful degrade: no AI reasoning, just a plain popular-picks
            // discover call, per the spec's error handling section.
            console.error('watchlog suggest: AI step failed, falling back to plain discover', aiErr);
            filters = { mediaType: 'movie' as const, genreIds: [], minRating: 6, rationale: 'Popular picks for you.' };
          }

          const [results, ignoredIds] = await Promise.all([
            discoverTmdb({
              mediaType: filters.mediaType,
              genreIds: filters.genreIds,
              minRating: filters.minRating,
            }),
            fetchIgnoredTmdbIds(supabase, profile.id),
          ]);
          const filtered = results.filter((r) => !ignoredIds.has(r.tmdbId));
          return { rationale: filters.rationale, results: filtered.slice(0, 10) };
        }
      );

      return NextResponse.json(responsePayload);
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (error) {
    console.error('watchlog suggest error:', error);
    return NextResponse.json({ error: formatAiError(MODEL, error) }, { status: 500 });
  }
}
