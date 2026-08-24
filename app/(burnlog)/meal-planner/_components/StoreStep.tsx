// app/(burnlog)/meal-planner/_components/StoreStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GROCERY_STORES, MANUAL_INGREDIENTS_OPTION, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type StoreStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'store' | 'onHandIngredients'>) => void;
};

export function StoreStep({ initialAnswers, onContinue }: StoreStepProps) {
  const [store, setStore] = useState(initialAnswers?.store ?? '');
  const [pantryText, setPantryText] = useState((initialAnswers?.onHandIngredients ?? []).join('\n'));

  const isManual = store === MANUAL_INGREDIENTS_OPTION;

  const handleContinue = () => {
    onContinue({
      store: store || GROCERY_STORES[0],
      onHandIngredients: isManual
        ? pantryText.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>🛒 Where are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll build your meals and grocery list around this.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Grocery store</Label>
          <Select value={store} onValueChange={setStore}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a store…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {GROCERY_STORES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <SelectItem value={MANUAL_INGREDIENTS_OPTION}>{MANUAL_INGREDIENTS_OPTION}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isManual && (
          <div className="space-y-2">
            <Label>What ingredients do you already have?</Label>
            <Textarea
              value={pantryText}
              onChange={(e) => setPantryText(e.target.value)}
              placeholder={'One item per line, e.g.\nRice\nChicken breast\nOnions'}
              rows={5}
            />
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleContinue} disabled={!store}>Continue →</Button>
        </div>
      </CardContent>
    </Card>
  );
}
