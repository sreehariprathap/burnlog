// app/(moneylog)/moneylog/onboarding/_components/IncomeSourcesStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { RecurringItemForm } from '@/components/moneylog/RecurringItemForm';
import { categoryLabel } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

interface IncomeSourcesStepProps {
  rows: RecurringItemDraft[];
  onAdd: (draft: RecurringItemDraft) => void;
  onRemove: (index: number) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function IncomeSourcesStep({ rows, onAdd, onRemove, onContinue, onSkip }: IncomeSourcesStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="flex items-center justify-between border-b pb-2">
                <span>
                  {row.label} ({categoryLabel(row.category)})
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{row.amount}</span>
                  <Button variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label={`Remove ${row.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <RecurringItemForm lockedType="income" onSubmit={onAdd} submitLabel="Add another income source" />
        <div className="flex gap-2">
          <Button onClick={onContinue}>Continue</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
