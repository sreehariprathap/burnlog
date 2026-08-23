// app/(lifelog)/lifelog/plan/_components/RecurringItemsList.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { categoryLabel } from '@/lib/financeCategories';
import type { PlanRecurringItem } from '../page';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function frequencyLabel(item: PlanRecurringItem): string {
  if (item.frequency === 'weekly') {
    return `Weekly on ${WEEKDAY_SHORT[item.dayOfWeek ?? 0]}`;
  }
  if (item.frequency === 'monthly') {
    const day = item.dayOfMonth ?? 1;
    return `Monthly on the ${day}${ordinalSuffix(day)}`;
  }
  const day = item.dayOfMonth ?? 1;
  return `Yearly on ${MONTH_SHORT[(item.monthOfYear ?? 1) - 1]} ${day}`;
}

interface RecurringItemsListProps {
  items: PlanRecurringItem[];
  onDelete: (id: string) => void;
}

export function RecurringItemsList({ items, onDelete }: RecurringItemsListProps) {
  const income = items.filter((item) => item.type === 'income');
  const expense = items.filter((item) => item.type === 'expense');

  function renderGroup(title: string, group: PlanRecurringItem[]) {
    if (group.length === 0) return null;
    return (
      <Card key={title}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {group.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryLabel(item.category)} · {frequencyLabel(item)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{item.amount.toLocaleString()}</span>
                <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No recurring items yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Add your income sources and recurring expenses below.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {renderGroup('Income', income)}
      {renderGroup('Expenses', expense)}
    </div>
  );
}
