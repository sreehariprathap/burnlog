// app/(lifelog)/lifelog/insights/_components/FinanceInsightsClient.tsx
'use client';

import { useMemo } from 'react';
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

interface FinanceInsightsClientProps {
  recurringItems: RecurringItemRow[];
  transactions: { type: string; category: string; amount: number; date: string }[];
}

const MONTHS_BACK = 6;

export default function FinanceInsightsClient({ recurringItems, transactions }: FinanceInsightsClientProps) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="font-semibold">{totalIncome.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Expense</p>
            <p className="font-semibold">{totalExpense.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="font-semibold">{net.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Savings Rate</p>
            <p className="font-semibold">{savingsRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

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
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#22C55E" />
              <Line type="monotone" dataKey="expense" stroke="#EF4444" />
              <Line type="monotone" dataKey="net" stroke="#3B82F6" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
              <Tooltip />
              <Bar dataKey="amount" fill="#EF4444" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
              <Tooltip />
              <Bar dataKey="amount" fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
