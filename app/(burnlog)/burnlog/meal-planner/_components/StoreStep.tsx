// app/(burnlog)/meal-planner/_components/StoreStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart } from 'lucide-react';
import { GROCERY_STORE_DOMAINS, GROCERY_STORES, MANUAL_INGREDIENTS_OPTION, type MealPlannerWizardAnswers } from '@/lib/ai/types';

type StoreStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'store' | 'onHandIngredients'>) => void;
};

function StoreLogo({ store }: { store: string }) {
  const domain = GROCERY_STORE_DOMAINS[store as keyof typeof GROCERY_STORE_DOMAINS];
  const [failed, setFailed] = useState(false);

  if (!domain || failed) {
    return <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  );
}

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
        <CardTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" />Where are you shopping?</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll build your meals and grocery list around this.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label id="store-label">Grocery store</Label>
          <Select value={store} onValueChange={setStore}>
            <SelectTrigger aria-labelledby="store-label">
              <SelectValue placeholder="Choose a store…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {GROCERY_STORES.map((s) => (
                <SelectItem key={s} value={s}>
                  <StoreLogo store={s} />
                  <span>{s}</span>
                </SelectItem>
              ))}
              <SelectItem value={MANUAL_INGREDIENTS_OPTION}>
                <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{MANUAL_INGREDIENTS_OPTION}</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isManual && (
          <div className="space-y-2">
            <Label htmlFor="pantry-text">What ingredients do you already have?</Label>
            <Textarea
              id="pantry-text"
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
