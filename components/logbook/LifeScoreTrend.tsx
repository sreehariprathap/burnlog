// components/logbook/LifeScoreTrend.tsx
'use client';

import useSWR from 'swr';
import { format as formatDate } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/apiFetch';
import type { LifeScoreMode } from '@/lib/logbook/lifeScore';

interface TrendPoint {
  date: string;
  engagementScore: number | null;
  streakScore: number | null;
  goalScore: number | null;
}

const MODE_FIELD: Record<LifeScoreMode, keyof TrendPoint> = {
  engagement: 'engagementScore',
  streak: 'streakScore',
  goal: 'goalScore',
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load trend');
  const json = await res.json();
  return json.trend as TrendPoint[];
}

export function LifeScoreTrend({ mode }: { mode: LifeScoreMode }) {
  const { data } = useSWR('/api/logbook/life-score-trend', fetcher);

  if (!data || data.length === 0) {
    return null;
  }

  const field = MODE_FIELD[mode];
  const series = data.map((p) => ({
    day: formatDate(new Date(p.date), 'MMM d'),
    value: p[field] ?? null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Life Score — last 30 days</CardTitle>
      </CardHeader>
      <CardContent className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
