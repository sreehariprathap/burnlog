// app/(travellog)/travellog/onboarding/_components/TravelLogOnboardingFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import { statesFor } from '@/lib/travellog/passportData';
import { CountriesStep } from './CountriesStep';
import { StatesStep } from './StatesStep';

type Step = 'countries' | 'states';

export function TravelLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/travellog';

  const [step, setStep] = useState<Step>('countries');
  const [countries, setCountries] = useState<string[]>([]);

  function finish() {
    router.push(returnTo);
  }

  async function save(entries: { country: string; state: string | null }[]) {
    if (entries.length > 0) {
      await apiFetch('/api/travellog/passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
    }
    finish();
  }

  if (step === 'countries') {
    return (
      <CountriesStep
        onContinue={(selected) => {
          setCountries(selected);
          const hasAnyStates = selected.some((c) => statesFor(c).length > 0);
          if (hasAnyStates) {
            setStep('states');
          } else {
            save(selected.map((country) => ({ country, state: null })));
          }
        }}
        onSkip={finish}
      />
    );
  }

  return (
    <StatesStep
      countries={countries}
      onContinue={(statesByCountry) => {
        const entries: { country: string; state: string | null }[] = [];
        for (const country of countries) {
          const states = statesByCountry[country] ?? [];
          if (states.length === 0) {
            entries.push({ country, state: null });
          } else {
            for (const state of states) entries.push({ country, state });
          }
        }
        save(entries);
      }}
      onSkip={() => save(countries.map((country) => ({ country, state: null })))}
    />
  );
}
