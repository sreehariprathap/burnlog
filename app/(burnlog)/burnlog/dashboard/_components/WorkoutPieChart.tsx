'use client';

import { Dumbbell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

// Workout distribution data type — the caller supplies real counts (e.g. by
// bodyPart), this component owns color assignment.
type WorkoutData = {
  name: string;
  value: number;
};

type WorkoutPieChartProps = {
  data: WorkoutData[];
};

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-5)',
  'var(--chart-4)',
];

type CustomTooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; payload: { color: string } }[];
};

type CustomLegendProps = {
  payload?: { value: string; color: string }[];
};

export function WorkoutPieChart({ data }: WorkoutPieChartProps) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return (
      <Card className="col-span-4 row-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workout Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Log a workout to see your breakdown</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((entry, index) => ({
    ...entry,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      const percent = total > 0 ? Math.round((entry.value / total) * 100) : 0;
      return (
        <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.payload.color }}
            />
            <span className="font-medium">{entry.name}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {entry.value} session{entry.value === 1 ? '' : 's'} · {percent}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: CustomLegendProps) => (
    <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {payload?.map((entry) => (
        <li key={entry.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </li>
      ))}
    </ul>
  );

  return (
    <Card className="col-span-4 row-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Workout Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="46%"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                cornerRadius={6}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 top-0 flex -translate-y-[4%] flex-col items-center justify-center">
            <span className="text-2xl font-bold tracking-tight">{total}</span>
            <span className="text-xs text-muted-foreground">sessions</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
