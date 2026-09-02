// app/(burnlog)/meal-planner/_components/AppliancesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ChefHat,
  Flame,
  Zap,
  Box,
  Microwave,
  Fan,
  Sandwich,
  Soup,
  CookingPot,
  Blend,
  Wheat,
  Beef,
  type LucideIcon,
} from 'lucide-react';
import { KITCHEN_APPLIANCES, type MealPlannerWizardAnswers } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

// Not every appliance has a dedicated lucide icon — several share the
// closest visual match available (e.g. both stove variants use a heat-based
// icon) rather than going without one.
const APPLIANCE_ICONS: Record<(typeof KITCHEN_APPLIANCES)[number], LucideIcon> = {
  'Stove (gas)': Flame,
  'Stove (electric/induction)': Zap,
  'Oven': Box,
  'Microwave': Microwave,
  'Air Fryer': Fan,
  'Toaster': Sandwich,
  'Slow Cooker': Soup,
  'Instant Pot / Pressure Cooker': CookingPot,
  'Blender': Blend,
  'Rice Cooker': Wheat,
  'Grill / BBQ': Beef,
};

type AppliancesStepProps = {
  initialAnswers?: Partial<MealPlannerWizardAnswers>;
  onContinue: (partial: Pick<MealPlannerWizardAnswers, 'appliances'>) => void;
};

export function AppliancesStep({ initialAnswers, onContinue }: AppliancesStepProps) {
  const [cookingAtHome, setCookingAtHome] = useState((initialAnswers?.appliances?.length ?? 0) > 0 || initialAnswers?.appliances === undefined);
  const [appliances, setAppliances] = useState<string[]>(initialAnswers?.appliances ?? []);

  const toggle = (value: string) => {
    setAppliances((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ChefHat className="w-5 h-5" />Cooking at home?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setCookingAtHome(true)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            Yes, I&apos;m cooking at home
          </button>
          <button
            type="button"
            onClick={() => setCookingAtHome(false)}
            className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
              !cookingAtHome ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            No, keep it no-cook / ready-to-eat
          </button>
        </div>

        {cookingAtHome && (
          <div className="space-y-2">
            <Label>What do you have available?</Label>
            <div className="grid grid-cols-3 gap-2">
              {KITCHEN_APPLIANCES.map((a) => {
                const Icon = APPLIANCE_ICONS[a];
                const selected = appliances.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggle(a)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors',
                      selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs leading-tight">{a}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onContinue({ appliances: cookingAtHome ? appliances : [] })}>
            Continue →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
