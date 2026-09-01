// app/api/ai/travellog/currency/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" query parameter' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Currency provider returned an error' }, { status: 502 });
    }
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (typeof rate !== 'number') {
      return NextResponse.json({ error: `No rate available for ${from} → ${to}` }, { status: 502 });
    }
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: 'Failed to reach currency provider' }, { status: 502 });
  }
}
