// app/(moneylog)/moneylog/assets/[id]/_components/AssetValueChart.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/format';

export type AssetChartPoint = { date: string; value: number };

export function AssetValueChart({ data }: { data: AssetChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Line type="monotone" dataKey="value" stroke="var(--primary)" />
      </LineChart>
    </ResponsiveContainer>
  );
}
