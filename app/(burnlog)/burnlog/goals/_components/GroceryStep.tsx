'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, CreditCard, ShoppingCart, ChefHat, Knife, Package, Leaf } from 'lucide-react';
import { GROCERY_STORES, type GroceryAnswers } from '@/lib/ai/types';

type GroceryStepProps = {
  onContinue: (answers: GroceryAnswers) => void;
  onSkip: () => void;
  initialAnswers?: Partial<GroceryAnswers>;
};

const SHOPPING_FREQUENCIES = [
  { value: 'multiple_per_week', label: 'Several times a week' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Once a month' },
  { value: 'as_needed', label: 'As needed / no fixed schedule' },
];

const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget-friendly — keep costs low', icon: DollarSign },
  { value: 'moderate', label: 'Moderate — reasonable quality at fair price', icon: CreditCard },
  { value: 'flexible', label: 'Flexible — willing to spend on quality', icon: ShoppingCart },
];

const COOKING_SKILLS = [
  { value: 'beginner', label: 'Beginner — simple recipes, minimal prep', icon: ChefHat },
  { value: 'intermediate', label: 'Intermediate — comfortable in the kitchen', icon: ChefHat },
  { value: 'advanced', label: 'Advanced — enjoy complex techniques', icon: Knife },
];

export function GroceryStep({ onContinue, onSkip, initialAnswers }: GroceryStepProps) {
  const [store, setStore] = useState(initialAnswers?.preferredStore ?? '');
  const [frequency, setFrequency] = useState<GroceryAnswers['shoppingFrequency']>(
    initialAnswers?.shoppingFrequency ?? 'weekly'
  );
  const [budget, setBudget] = useState<GroceryAnswers['budget']>(
    initialAnswers?.budget ?? 'moderate'
  );
  const [skill, setSkill] = useState<GroceryAnswers['cookingSkill']>(
    initialAnswers?.cookingSkill ?? 'intermediate'
  );

  const handleContinue = () => {
    onContinue({
      preferredStore: store || 'Other',
      shoppingFrequency: frequency,
      budget,
      cookingSkill: skill,
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" />Food & Grocery Preferences</CardTitle>
        <p className="text-sm text-muted-foreground">
          Help us build your perfect weekly meal plan and grocery list.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Grocery store */}
        <div className="space-y-2">
          <Label>Where do you usually shop?</Label>
          <Select value={store} onValueChange={setStore}>
            <SelectTrigger>
              <SelectValue placeholder="Choose your grocery store…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {GROCERY_STORES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            We&apos;ll suggest recipes using ingredients commonly found at your store.
          </p>
        </div>

        {/* Shopping frequency */}
        <div className="space-y-2">
          <Label>How often do you shop?</Label>
          <div className="grid gap-2">
            {SHOPPING_FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrequency(f.value as GroceryAnswers['shoppingFrequency'])}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  frequency === f.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {frequency === 'biweekly' || frequency === 'monthly' || frequency === 'as_needed'
              ? <><Package className="w-3 h-3" />We&apos;ll prioritise longer shelf-life ingredients.</>
              : <><Leaf className="w-3 h-3" />Fresh ingredients are fair game!</>}
          </p>
        </div>

        {/* Budget */}
        <div className="space-y-2">
          <Label>Weekly food budget</Label>
          <div className="grid gap-2">
            {BUDGET_OPTIONS.map((b) => {
              const IconComponent = b.icon;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBudget(b.value as GroceryAnswers['budget'])}
                  className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-2 ${
                    budget === b.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <IconComponent className="w-4 h-4 flex-shrink-0" />
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cooking skill */}
        <div className="space-y-2">
          <Label>Cooking skill level</Label>
          <div className="grid gap-2">
            {COOKING_SKILLS.map((c) => {
              const IconComponent = c.icon;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSkill(c.value as GroceryAnswers['cookingSkill'])}
                  className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-2 ${
                    skill === c.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <IconComponent className="w-4 h-4 flex-shrink-0" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onSkip} className="flex-1">
            Skip
          </Button>
          <Button onClick={handleContinue} className="flex-1">
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
