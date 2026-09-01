'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppId, isAppId } from '@/lib/appMode';

const ONBOARDING_ROUTES: Partial<Record<AppId, string>> = {
  burnlog: '/ai-setup',
  moneylog: '/moneylog/onboarding',
  tasklog: '/tasklog/onboarding',
  homelog: '/homelog/onboarding',
};

export default function OnboardingSequencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const apps = (searchParams.get('apps') ?? '')
      .split(',')
      .filter((v): v is AppId => isAppId(v));
    const step = Number(searchParams.get('step') ?? '0') || 0;
    const returnTo = searchParams.get('returnTo') ?? '/logbook';

    if (step >= apps.length) {
      router.replace(returnTo);
      return;
    }

    const current = apps[step];
    const onboardingRoute = ONBOARDING_ROUTES[current];
    const nextSequenceUrl = `/onboarding/sequence?apps=${apps.join(',')}&step=${step + 1}&returnTo=${encodeURIComponent(returnTo)}`;

    if (onboardingRoute) {
      router.replace(`${onboardingRoute}?returnTo=${encodeURIComponent(nextSequenceUrl)}`);
    } else {
      router.replace(nextSequenceUrl);
    }
  }, [searchParams, router]);

  return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin w-8 h-8" />
    </div>
  );
}
