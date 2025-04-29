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

export function WorkoutPieChart({ 
  data = [
    { name: 'Push', value: 3, color: '#3B82F6' },
    { name: 'Pull', value: 2, color: '#10B981' },
    { name: 'Legs', value: 2, color: '#F59E0B' },
    { name: 'Rest', value: 1, color: '#A1A1AA' },
  ] 
}: WorkoutPieChartProps) {
  
  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border rounded shadow text-sm">
          <p>{`${payload[0].name}: ${payload[0].value} sessions`}</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <Card className="col-span-4 row-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Workout Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend layout="horizontal" verticalAlign="bottom" align="center" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}