// app/(moneylog)/moneylog/goals/_components/FinancialGoalsList.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { StatRing } from '@/components/ui/stat-ring';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Pencil } from 'lucide-react';
import { FINANCIAL_GOAL_TYPES } from '@/lib/financialGoalTypes';
import { EXPENSE_CATEGORIES, categoryLabel } from '@/lib/financeCategories';
import { computeGoalProgress, type FinancialGoalRow } from '@/lib/financeGoalProgress';
import { expandRecurringInRange } from '@/lib/financePeriods';
import type { RecurringItemRow, FinanceLineItem } from '@/lib/financePeriods';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';

interface FinancialGoalsListProps {
  goals: FinancialGoalRow[];
  profileId: string | null;
  onGoalUpdated?: (goal: FinancialGoalRow) => void;
}

function goalTypeLabel(goalType: string): string {
  return FINANCIAL_GOAL_TYPES.find((g) => g.value === goalType)?.label ?? goalType;
}

export function FinancialGoalsList({ goals, profileId, onGoalUpdated }: FinancialGoalsListProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [recurringItems, setRecurringItems] = useState<RecurringItemRow[]>([]);
  const [transactions, setTransactions] = useState<{ type: string; category: string; amount: number; date: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editTargetValue, setEditTargetValue] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(goal: FinancialGoalRow) {
    setEditingId(goal.id);
    setEditLabel(goal.label);
    setEditTargetValue(String(goal.targetValue));
    setEditCategory(goal.category ?? EXPENSE_CATEGORIES[0].value);
    setEditTargetDate(goal.targetDate ? goal.targetDate.slice(0, 10) : '');
  }

  async function saveEdit(goal: FinancialGoalRow) {
    const targetNum = Number(editTargetValue);
    if (!editLabel.trim() || !editTargetValue || isNaN(targetNum) || targetNum <= 0) {
      toast({ title: 'Please enter a valid label and target amount', variant: 'destructive' });
      return;
    }
    const needsCategory = goal.goalType === 'spending_cap' || goal.goalType === 'investment_contribution';
    const needsDate = goal.goalType === 'savings_target' || goal.goalType === 'debt_payoff';

    setSavingEdit(true);
    const { data, error } = await supabase
      .from('financial_goals')
      .update({
        label: editLabel.trim(),
        targetValue: targetNum,
        category: needsCategory ? editCategory : null,
        targetDate: needsDate && editTargetDate ? editTargetDate : null,
      })
      .eq('id', goal.id)
      .select()
      .single();
    setSavingEdit(false);

    if (error) {
      toast({ title: 'Failed to update goal', description: error.message, variant: 'destructive' });
      return;
    }
    onGoalUpdated?.(data as FinancialGoalRow);
    toast({ title: 'Goal updated' });
    setEditingId(null);
  }

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
          <Target className="w-10 h-10 mx-auto text-primary" aria-hidden="true" />
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
        const needsCategory = goal.goalType === 'spending_cap' || goal.goalType === 'investment_contribution';
        const needsDate = goal.goalType === 'savings_target' || goal.goalType === 'debt_payoff';

        if (editingId === goal.id) {
          return (
            <Card key={goal.id}>
              <CardHeader>
                <CardTitle className="text-base">Edit goal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-label-${goal.id}`}>Label</Label>
                  <Input id={`edit-label-${goal.id}`} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-target-${goal.id}`}>Target amount</Label>
                  <Input
                    id={`edit-target-${goal.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(e.target.value)}
                  />
                </div>
                {needsCategory && (
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {needsDate && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-date-${goal.id}`}>Target date (optional)</Label>
                    <Input
                      id={`edit-date-${goal.id}`}
                      type="date"
                      value={editTargetDate}
                      onChange={(e) => setEditTargetDate(e.target.value)}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => saveEdit(goal)} disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingId(null)} disabled={savingEdit}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <StatCard key={goal.id} title={goal.label} className="relative">
            <button
              type="button"
              onClick={() => startEdit(goal)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              aria-label={`Edit ${goal.label}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-4">
              <StatRing value={progress.pct} size="sm" className="text-sm" />
              <div>
                <p className="text-sm text-muted-foreground">{goalTypeLabel(goal.goalType)}</p>
                {goal.category && <p className="text-xs text-muted-foreground">{categoryLabel(goal.category)}</p>}
                <p className="font-semibold">
                  {formatCurrency(progress.current)} / {formatCurrency(progress.target)}
                </p>
              </div>
            </div>
          </StatCard>
        );
      })}
    </div>
  );
}
