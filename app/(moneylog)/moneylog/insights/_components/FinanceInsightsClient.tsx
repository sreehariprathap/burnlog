// app/(moneylog)/moneylog/insights/_components/FinanceInsightsClient.tsx
'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';
import { categoryLabel } from '@/lib/financeCategories';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { getPeriodConfig, getMonthRange } from '@/lib/moneylog/period';
import { formatCurrency } from '@/lib/format';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { BenchmarkAreaChart } from '@/components/insights/BenchmarkAreaChart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { LayoutGrid, TrendingUp, ArrowDownCircle, ArrowUpCircle, Users } from 'lucide-react';

interface FinanceInsightsClientProps {
  recurringItems: RecurringItemRow[];
  transactions: { type: string; category: string; amount: number; date: string }[];
}

const MONTHS_BACK = 6;

const insightTabs: TabItem[] = [
  { id: 'overview', icon: LayoutGrid, label: 'Overview', color: 'var(--chart-1)' },
  { id: 'cashflow', icon: TrendingUp, label: 'Cashflow', color: 'var(--chart-2)' },
  { id: 'expenses', icon: ArrowDownCircle, label: 'Expenses', color: 'var(--chart-3)' },
  { id: 'income', icon: ArrowUpCircle, label: 'Income', color: 'var(--chart-4)' },
  { id: 'benchmark', icon: Users, label: 'Benchmarks', color: 'var(--chart-5)' },
];

const cashflowChartConfig = {
  income: { label: 'Income', color: 'var(--success)' },
  expense: { label: 'Expense', color: 'var(--destructive)' },
  net: { label: 'Net', color: 'var(--info)' },
} satisfies ChartConfig;

export default function FinanceInsightsClient({ recurringItems, transactions }: FinanceInsightsClientProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { profile } = useCurrentProfile();
  const periodConfig = getPeriodConfig(profile);
  const now = new Date();
  const currentMonth = getMonthRange(now, periodConfig);
  const rangeStart = getMonthRange(
    new Date(currentMonth.start.getFullYear(), currentMonth.start.getMonth() - (MONTHS_BACK - 1), currentMonth.start.getDate()),
    periodConfig
  ).start;
  const rangeEnd = currentMonth.end;

  const allItems: FinanceLineItem[] = useMemo(
    () => [
      ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
      ...expandRecurringInRange(recurringItems, rangeStart, rangeEnd),
    ],
    [transactions, recurringItems, rangeStart, rangeEnd]
  );

  const monthlySeries = useMemo(() => {
    const buckets: { start: Date; end: Date }[] = [];
    let bucketStart = rangeStart;
    for (let i = 0; i < MONTHS_BACK; i++) {
      const { start, end } = getMonthRange(bucketStart, periodConfig);
      buckets.push({ start, end });
      bucketStart = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
    }
    return buckets.map(({ start: mStart, end: mEnd }) => {
      const inMonth = allItems.filter((i) => i.date >= mStart && i.date <= mEnd);
      const income = inMonth.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
      const expense = inMonth.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
      return { month: format(mStart, 'MMM'), income, expense, net: income - expense };
    });
  }, [allItems, rangeStart, periodConfig]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of allItems) {
      if (item.type !== 'expense') continue;
      map[item.category] = (map[item.category] || 0) + item.amount;
    }
    return Object.entries(map).map(([category, amount]) => ({ category: categoryLabel(category), amount }));
  }, [allItems]);

  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of allItems) {
      if (item.type !== 'income') continue;
      map[item.category] = (map[item.category] || 0) + item.amount;
    }
    return Object.entries(map).map(([category, amount]) => ({ category: categoryLabel(category), amount }));
  }, [allItems]);

  const totalIncome = allItems.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
  const totalExpense = allItems.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  const overviewSlide = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-semibold">{formatCurrency(totalIncome)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Expense</p>
          <p className="font-semibold">{formatCurrency(totalExpense)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className="font-semibold">{formatCurrency(net)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Savings Rate</p>
          <p className="font-semibold">{savingsRate.toFixed(1)}%</p>
        </CardContent>
      </Card>
    </div>
  );

  const cashflowSlide = (
    <Card>
      <CardHeader>
        <CardTitle>Cashflow (last {MONTHS_BACK} months)</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ChartContainer config={cashflowChartConfig} className="h-full w-full aspect-auto">
          <AreaChart data={monthlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(value, name) => [formatCurrency(Number(value)), String(name)]} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <defs>
              <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-income)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-income)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-expense)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-expense)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-net)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-net)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="income" stroke="var(--color-income)" fill="url(#fillIncome)" fillOpacity={0.4} />
            <Area type="monotone" dataKey="expense" stroke="var(--color-expense)" fill="url(#fillExpense)" fillOpacity={0.4} />
            <Area type="monotone" dataKey="net" stroke="var(--color-net)" fill="url(#fillNet)" fillOpacity={0.4} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );

  const expensesSlide = (
    <Card>
      <CardHeader>
        <CardTitle>Expenses by category</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={expenseByCategory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="amount" fill="var(--destructive)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  const incomeSlide = (
    <Card>
      <CardHeader>
        <CardTitle>Income by category</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={incomeByCategory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="amount" fill="var(--success)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  const benchmarkSlide = (
    <Card>
      <CardHeader>
        <CardTitle>Benchmarks</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium mb-2">Budget used vs peers</p>
        <BenchmarkAreaChart app="moneylog" metric="budgetPct" label="Budget used" unit="%" />
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={insightTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
      </div>
      <MotionCarousel
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        slides={[overviewSlide, cashflowSlide, expensesSlide, incomeSlide, benchmarkSlide]}
      />
    </div>
  );
}
