// app/(travellog)/travellog/onboarding/_components/CountriesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PASSPORT_COUNTRIES } from '@/lib/travellog/passportData';

interface CountriesStepProps {
  onContinue: (countries: string[]) => void;
  onSkip: () => void;
}

export function CountriesStep({ onContinue, onSkip }: CountriesStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(country: string) {
    const next = new Set(selected);
    if (next.has(country)) next.delete(country);
    else next.add(country);
    setSelected(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your digital passport</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Which countries have you visited? Pick as many as you like — for a few, we&apos;ll ask which states or
          provinces too.
        </p>
        <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
          {PASSPORT_COUNTRIES.map((country) => {
            const isSelected = selected.has(country);
            return (
              <button
                key={country}
                type="button"
                onClick={() => toggle(country)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                )}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
                {country}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onContinue(Array.from(selected))} disabled={selected.size === 0}>
            Continue
          </Button>
          <Button variant="outline" onClick={onSkip}>Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
