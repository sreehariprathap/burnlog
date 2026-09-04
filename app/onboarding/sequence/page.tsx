'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppId, isAppId } from '@/lib/appMode';

const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
  burnlog: '/burnlog/ai-setup',
  moneylog: '/moneylog/onboarding',
  tasklog: '/tasklog/onboarding',
  homelog: '/homelog/onboarding',
};

function LoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin w-8 h-8" />
    </div>
  );
}

export default function OnboardingSequencePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OnboardingSequenceRedirect />
    </Suspense>
  );
}

function OnboardingSequenceRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const apps = (searchParams.get('apps') ?? '')
      .split(',')
      .filter((v): v is AppId => isAppId(v));
    const step = Number(searchParams.get('step') ?? '0') || 0;
    const returnTo = searchParams.get('returnTo') ?? '/onboarding/complete';

    if (step >= apps.length) {
      router.replace(returnTo);
      return;
    }

    const current = apps[step];
    const onboardingRoute = ONBOARDING_ROUTES[current];
    // The app (if any) that comes after this one in the sequence, so the
    // current step's completion screen can label its continue button with
    // the actual next destination instead of hardcoding its own name.
    const nextApp = apps[step + 1];
    const nextSequenceUrl = `/onboarding/sequence?apps=${apps.join(',')}&step=${step + 1}&returnTo=${encodeURIComponent(returnTo)}`;

    if (onboardingRoute) {
      const params = new URLSearchParams({ returnTo: nextSequenceUrl });
      if (nextApp) {
        params.set('nextApp', nextApp);
      } else {
        // No app follows this one in the sequence — tell the completion
        // screen it's the last step so it doesn't have to guess a label
        // from an app id that doesn't exist.
        params.set('lastStep', '1');
      }
      router.replace(`${onboardingRoute}?${params.toString()}`);
    } else {
      router.replace(nextSequenceUrl);
    }
  }, [searchParams, router]);

  return <LoadingFallback />;
}
