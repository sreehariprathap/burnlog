// app/(burnlog)/meal-planner/_components/GroceryListStep.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type GroceryListStepProps = {
  groceryList: Record<string, string[]>;
  estimatedBudget: string;
  onContinue: () => void;
};

export function GroceryListStep({ groceryList, estimatedBudget, onContinue }: GroceryListStepProps) {
  return (
    <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>🧾 Your grocery list</CardTitle>
        {estimatedBudget && <p className="text-sm text-muted-foreground">Estimated budget: {estimatedBudget}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groceryList).map(([category, items]) => (
          items.length > 0 && (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{category}</p>
              <ul className="text-sm space-y-1">
                {items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )
        ))}

        <div className="flex justify-end pt-2">
          <Button onClick={onContinue}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
