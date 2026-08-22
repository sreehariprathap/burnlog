/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

// Workout distribution data type
type WorkoutData = {
  name: string;
  value: number;
  color: string;
};

type WorkoutPieChartProps = {
  data?: WorkoutData[];
};

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-5)',
];

export function WorkoutPieChart({
  data = [
    { name: 'Push', value: 3, color: CHART_COLORS[0] },
    { name: 'Pull', value: 2, color: CHART_COLORS[1] },
    { name: 'Legs', value: 2, color: CHART_COLORS[2] },
    { name: 'Rest', value: 1, color: CHART_COLORS[3] },
  ],
}: WorkoutPieChartProps) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
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

  const CustomLegend = ({ payload }: any) => (
    <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {payload?.map((entry: any) => (
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
                data={data}
                cx="50%"
                cy="46%"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                cornerRadius={6}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
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
