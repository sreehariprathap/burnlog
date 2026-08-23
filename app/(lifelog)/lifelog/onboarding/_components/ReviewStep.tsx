// app/(lifelog)/lifelog/onboarding/_components/ReviewStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { categoryLabel } from '@/lib/financeCategories';
import type { RecurringItemDraft } from '@/lib/recurringItemDraft';

interface ReviewStepProps {
  incomeRows: RecurringItemDraft[];
  expenseRows: RecurringItemDraft[];
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function ReviewStep({ incomeRows, expenseRows, saving, error, onConfirm, onBack }: ReviewStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {incomeRows.length === 0 && expenseRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing added yet — you can always add items later from the Plan tab.
          </p>
        ) : (
          <div className="space-y-3">
            {incomeRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Income</h3>
                <ul className="space-y-1">
                  {incomeRows.map((row, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span>
                        {row.label} ({categoryLabel(row.category)})
                      </span>
                      <span className="font-medium">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {expenseRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Expenses</h3>
                <ul className="space-y-1">
                  {expenseRows.map((row, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span>
                        {row.label} ({categoryLabel(row.category)})
                      </span>
                      <span className="font-medium">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
