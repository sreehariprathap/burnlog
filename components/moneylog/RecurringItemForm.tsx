// components/moneylog/RecurringItemForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface RecurringItemFormProps {
  lockedType?: 'income' | 'expense';
  onSubmit: (draft: RecurringItemDraft) => void;
  submitLabel?: string;
}

export function RecurringItemForm({ lockedType, onSubmit, submitLabel = 'Add' }: RecurringItemFormProps) {
  const [type, setType] = useState<'income' | 'expense'>(lockedType ?? 'income');
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [category, setCategory] = useState<string>(categories[0].value);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'semimonthly'>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [monthOfYear, setMonthOfYear] = useState('1');
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [secondDayOfMonth, setSecondDayOfMonth] = useState('1');
  const [secondDayIsLastOfMonth, setSecondDayIsLastOfMonth] = useState(true);
  const [error, setError] = useState('');

  function handleTypeChange(next: 'income' | 'expense') {
    setType(next);
    const nextCategories = next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setCategory(nextCategories[0].value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amountNum = Number(amount);
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    onSubmit({
      type,
      category,
      label: label.trim(),
      amount: amountNum,
      frequency,
      dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : null,
      dayOfMonth: frequency === 'monthly' || frequency === 'yearly' || frequency === 'semimonthly' ? Number(dayOfMonth) : null,
      monthOfYear: frequency === 'yearly' ? Number(monthOfYear) : null,
      anchorDate: frequency === 'biweekly' ? new Date(anchorDate).toISOString() : null,
      secondDayOfMonth:
        frequency === 'semimonthly' ? (secondDayIsLastOfMonth ? 0 : Number(secondDayOfMonth)) : null,
    });

    setLabel('');
    setAmount('');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!lockedType && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === 'income' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('income')}
          >
            Income
          </Button>
          <Button
            type="button"
            variant={type === 'expense' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTypeChange('expense')}
          >
            Expense
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="recurring-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="recurring-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recurring-label">Label</Label>
        <Input
          id="recurring-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Rent"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recurring-amount">Amount</Label>
        <Input
          id="recurring-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recurring-frequency">Frequency</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
          <SelectTrigger id="recurring-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Biweekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="semimonthly">Twice a month</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {frequency === 'weekly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-day-of-week">Day of week</Label>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger id="recurring-day-of-week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(frequency === 'monthly' || frequency === 'yearly' || frequency === 'semimonthly') && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-day-of-month">{frequency === 'semimonthly' ? 'First day of month' : 'Day of month'}</Label>
          <Input
            id="recurring-day-of-month"
            type="number"
            inputMode="numeric"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
      )}

      {frequency === 'semimonthly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-second-day">Second date</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={secondDayIsLastOfMonth ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSecondDayIsLastOfMonth(true)}
            >
              Last day of month
            </Button>
            <Button
              type="button"
              variant={!secondDayIsLastOfMonth ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSecondDayIsLastOfMonth(false)}
            >
              Specific day
            </Button>
          </div>
          {!secondDayIsLastOfMonth && (
            <Input
              id="recurring-second-day"
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              value={secondDayOfMonth}
              onChange={(e) => setSecondDayOfMonth(e.target.value)}
            />
          )}
        </div>
      )}

      {frequency === 'biweekly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-anchor-date">Anchor date (a date this was/will be paid)</Label>
          <Input
            id="recurring-anchor-date"
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </div>
      )}

      {frequency === 'yearly' && (
        <div className="space-y-1.5">
          <Label htmlFor="recurring-month">Month</Label>
          <Select value={monthOfYear} onValueChange={setMonthOfYear}>
            <SelectTrigger id="recurring-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={month} value={String(index + 1)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
