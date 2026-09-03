// components/insights/BenchmarkAreaChart.tsx
'use client';

import useSWR from 'swr';
import { Area, ComposedChart, CartesianGrid, XAxis, Line } from 'recharts';
import { format, parseISO } from 'date-fns';
import { Users } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

interface BenchmarkAreaChartProps {
  app: string;
  metric: string;
  label: string;
  unit: string;
}

type BenchmarkPoint = {
  date: string;
  own: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
};

/** Derived field: how tall the shaded p25-p75 band is, stacked on top of p25. */
type ChartRow = BenchmarkPoint & { band: number | null };

export function BenchmarkAreaChart({ app, metric, label, unit }: BenchmarkAreaChartProps) {
  const { data } = useSWR(`/api/intellog/benchmark?app=${app}&metric=${metric}`, async (url: string) => {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to load benchmark data');
    return body.points as BenchmarkPoint[];
  });

  const chartConfig = {
    own: { label, color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  if (!data) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const hasCohortData = data.some((p) => p.p25 !== null);

  if (!hasCohortData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center px-4">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">Not enough similar users yet to compare</p>
        <p className="text-xs text-muted-foreground">
          Keep logging — this fills in once enough people in your cohort have history too.
        </p>
      </div>
    );
  }

  const rows: ChartRow[] = data.map((p) => ({
    ...p,
    band: p.p25 !== null && p.p75 !== null ? p.p75 - p.p25 : null,
  }));

  return (
    <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto">
      <ComposedChart data={rows} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(date) => format(parseISO(date), 'MMM d')}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(date) => format(parseISO(date as string), 'MMM d, yyyy')}
              formatter={(value, name) => [`${value} ${unit}`, name === 'own' ? label : String(name)]}
            />
          }
        />
        <defs>
          <linearGradient id="fillOwnBenchmark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-own)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-own)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area dataKey="p25" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area
          dataKey="band"
          stackId="band"
          stroke="none"
          fill="var(--muted-foreground)"
          fillOpacity={0.15}
          isAnimationActive={false}
          name="Peer range (p25-p75)"
        />
        <Line
          dataKey="p50"
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          strokeWidth={1}
          dot={false}
          name="Peer median"
        />
        <Area dataKey="own" type="natural" fill="url(#fillOwnBenchmark)" fillOpacity={0.4} stroke="var(--color-own)" />
      </ComposedChart>
    </ChartContainer>
  );
}
