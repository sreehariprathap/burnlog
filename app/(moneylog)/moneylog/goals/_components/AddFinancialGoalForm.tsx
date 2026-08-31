// app/(moneylog)/moneylog/goals/_components/AddFinancialGoalForm.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FINANCIAL_GOAL_TYPES } from '@/lib/financialGoalTypes';
import { EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import type { FinancialGoalRow } from '@/lib/financeGoalProgress';
import { useToast } from '@/components/ui/use-toast';

interface AddFinancialGoalFormProps {
  profileId: string;
  onGoalAdded: (goal: FinancialGoalRow) => void;
}

export function AddFinancialGoalForm({ profileId, onGoalAdded }: AddFinancialGoalFormProps) {
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const [goalType, setGoalType] = useState<string>(FINANCIAL_GOAL_TYPES[0].value);
  const [label, setLabel] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const needsCategory = goalType === 'spending_cap' || goalType === 'investment_contribution';
  const needsDate = goalType === 'savings_target' || goalType === 'debt_payoff';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const targetNum = Number(targetValue);
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!targetValue || isNaN(targetNum) || targetNum <= 0) {
      setError('Please enter a valid target amount');
      return;
    }

    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('financial_goals')
        .insert([
          {
            profileId,
            goalType,
            label: label.trim(),
            targetValue: targetNum,
            category: needsCategory ? category : null,
            targetDate: needsDate && targetDate ? targetDate : null,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      onGoalAdded(data as FinancialGoalRow);
      toast({ title: 'Goal added' });
      setLabel('');
      setTargetValue('');
      setTargetDate('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add goal';
      setError(message);
      toast({ title: 'Failed to add goal', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a financial goal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Goal type</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINANCIAL_GOAL_TYPES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-label">Label</Label>
            <Input
              id="goal-label"
              autoComplete="off"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Emergency Fund"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Target amount</Label>
            <Input
              id="goal-target"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {needsCategory && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
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
              <Label htmlFor="goal-target-date">Target date (optional)</Label>
              <Input id="goal-target-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Adding…' : 'Add goal'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
