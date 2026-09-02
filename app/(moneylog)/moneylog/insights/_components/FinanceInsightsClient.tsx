// app/(moneylog)/moneylog/insights/_components/FinanceInsightsClient.tsx
'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';
import { categoryLabel } from '@/lib/financeCategories';
import { formatCurrency } from '@/lib/format';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { LayoutGrid, TrendingUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

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
];

export default function FinanceInsightsClient({ recurringItems, transactions }: FinanceInsightsClientProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const now = new Date();
  const rangeStart = startOfMonth(subMonths(now, MONTHS_BACK - 1));
  const rangeEnd = endOfMonth(now);

  const allItems: FinanceLineItem[] = useMemo(
    () => [
      ...transactions.map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
      ...expandRecurringInRange(recurringItems, rangeStart, rangeEnd),
    ],
    [transactions, recurringItems, rangeStart, rangeEnd]
  );

  const monthlySeries = useMemo(() => {
    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
    return months.map((month) => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const inMonth = allItems.filter((i) => i.date >= mStart && i.date <= mEnd);
      const income = inMonth.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
      const expense = inMonth.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
      return { month: format(month, 'MMM'), income, expense, net: income - expense };
    });
  }, [allItems, rangeStart, rangeEnd]);

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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthlySeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Line type="monotone" dataKey="income" stroke="var(--success)" />
            <Line type="monotone" dataKey="expense" stroke="var(--destructive)" />
            <Line type="monotone" dataKey="net" stroke="var(--info)" />
          </LineChart>
        </ResponsiveContainer>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-14 z-10 -mx-4 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={insightTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
      </div>
      <MotionCarousel
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        slides={[overviewSlide, cashflowSlide, expensesSlide, incomeSlide]}
      />
    </div>
  );
}
