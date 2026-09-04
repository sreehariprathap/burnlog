// app/api/ai/travellog/currency/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runAiJob, AiRouteError } from '@/lib/ai/jobs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" query parameter' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('userId', user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    try {
      const responsePayload = await runAiJob(
        supabase,
        profile.id,
        { jobType: 'travellog-currency', app: 'travellog' },
        { from, to },
        async (signal) => {
          const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal });
          if (!res.ok) {
            throw new AiRouteError('Currency provider returned an error', 502);
          }
          const data = (await res.json()) as { rates?: Record<string, number> };
          const rate = data.rates?.[to];
          if (typeof rate !== 'number') {
            throw new AiRouteError(`No rate available for ${from} → ${to}`, 502);
          }
          return { rate };
        }
      );

      return NextResponse.json(responsePayload);
    } catch (err) {
      if (err instanceof AiRouteError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch {
    return NextResponse.json({ error: 'Failed to reach currency provider' }, { status: 502 });
  }
}
