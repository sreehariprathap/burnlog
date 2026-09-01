// app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { FINANCIAL_GOAL_TYPES } from '@/lib/financialGoalTypes';
import { categoryLabel } from '@/lib/financeCategories';
import { computeGoalProgress, type FinancialGoalRow } from '@/lib/financeGoalProgress';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';
import { formatCurrency } from '@/lib/format';

interface FinancialGoalsListProps {
  goals: FinancialGoalRow[];
  profileId: string | null;
}

function goalTypeLabel(goalType: string): string {
  return FINANCIAL_GOAL_TYPES.find((g) => g.value === goalType)?.label ?? goalType;
}

export function FinancialGoalsList({ goals, profileId }: FinancialGoalsListProps) {
  const supabase = createClient();
  const [recurringItems, setRecurringItems] = useState<RecurringItemRow[]>([]);
  const [transactions, setTransactions] = useState<{ type: string; category: string; amount: number; date: string }[]>([]);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const [recurringRes, transactionsRes] = await Promise.all([
        supabase.from('recurring_items').select('*').eq('profileId', profileId).eq('isActive', true),
        supabase.from('finance_transactions').select('*').eq('profileId', profileId),
      ]);
      setRecurringItems((recurringRes.data as RecurringItemRow[]) || []);
      setTransactions(
        (transactionsRes.data as { type: string; category: string; amount: number; date: string }[]) || []
      );
    })();
  }, [profileId, supabase]);

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No financial goals yet</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-2">
          <div className="text-4xl" aria-hidden="true">🎯</div>
          <p className="text-sm text-muted-foreground">Add your first goal below to start tracking progress.</p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  return (
    <div className="space-y-4">
      {goals.map((goal) => {
        const createdAt = new Date(goal.createdAt);

        const sinceCreationItems: FinanceLineItem[] = [
          ...transactions
            .filter((t) => new Date(t.date) >= createdAt)
            .map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
          ...expandRecurringInRange(recurringItems, createdAt, now),
        ];

        const thisMonthItems: FinanceLineItem[] = [
          ...transactions
            .filter((t) => new Date(t.date) >= monthStart && new Date(t.date) <= monthEnd)
            .map((t) => ({ type: t.type, category: t.category, amount: t.amount, date: new Date(t.date) })),
          ...expandRecurringInRange(recurringItems, monthStart, monthEnd),
        ];

        const progress = computeGoalProgress(goal, sinceCreationItems, thisMonthItems);

        return (
          <Card key={goal.id}>
            <CardHeader>
              <CardTitle>{goal.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <AnimatedCircularProgressBar
                value={progress.pct}
                gaugePrimaryColor="var(--primary)"
                gaugeSecondaryColor="var(--muted)"
                className="size-20 text-sm"
              />
              <div>
                <p className="text-sm text-muted-foreground">{goalTypeLabel(goal.goalType)}</p>
                {goal.category && <p className="text-xs text-muted-foreground">{categoryLabel(goal.category)}</p>}
                <p className="font-semibold">
                  {formatCurrency(progress.current)} / {formatCurrency(progress.target)}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
