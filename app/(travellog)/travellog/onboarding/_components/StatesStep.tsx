// app/(travellog)/travellog/onboarding/_components/StatesStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statesFor } from '@/lib/travellog/passportData';

interface StatesStepProps {
  countries: string[];
  onContinue: (statesByCountry: Record<string, string[]>) => void;
  onSkip: () => void;
}

export function StatesStep({ countries, onContinue, onSkip }: StatesStepProps) {
  const countriesWithStates = countries.filter((c) => statesFor(c).length > 0);
  const [selected, setSelected] = useState<Record<string, Set<string>>>(
    Object.fromEntries(countriesWithStates.map((c) => [c, new Set<string>()]))
  );

  function toggle(country: string, state: string) {
    const current = new Set(selected[country] ?? []);
    if (current.has(state)) current.delete(state);
    else current.add(state);
    setSelected({ ...selected, [country]: current });
  }

  function submit() {
    onContinue(Object.fromEntries(Object.entries(selected).map(([c, s]) => [c, Array.from(s)])));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Which states or provinces?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {countriesWithStates.map((country) => (
          <div key={country} className="space-y-2">
            <p className="text-sm font-medium">{country}</p>
            <div className="flex flex-wrap gap-2">
              {statesFor(country).map((state) => {
                const isSelected = selected[country]?.has(state) ?? false;
                return (
                  <button
                    key={state}
                    type="button"
                    onClick={() => toggle(country, state)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {state}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button onClick={submit}>Finish</Button>
          <Button variant="outline" onClick={onSkip}>Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
