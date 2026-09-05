// app/(intellog)/intellog/onboarding/_components/IntelLogOnboardingFlow.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/icons/animated/sparkles';

export function IntelLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/intellog';

  return (
    <Card>
      <CardHeader className="flex flex-col items-center gap-3">
        <SparklesIcon size={40} />
        <CardTitle>Meet IntelLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          IntelLog is your cross-app AI assistant — a fitness coach, a financial coach, and a task coach, all
          looking at your data together instead of in separate silos. Ask it anything about how your apps connect.
        </p>
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Your activity across the apps you use may be sent to our AI provider to generate suggestions, and may
          be used to help us improve how our AI features work. See our{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
        <Button className="w-full" onClick={() => router.push(returnTo)}>Continue</Button>
      </CardContent>
    </Card>
  );
}
