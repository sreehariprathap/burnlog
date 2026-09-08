// components/SwitchLoader.tsx
'use client';

import type { AppId } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';
import {
  APP_SWITCH_LOADING_STATES,
  APP_SWITCH_STEP_DURATION_MS,
} from '@/lib/appSwitchLoadingStates';
import { MultiStepLoader } from '@/components/ui/multi-step-loader';
import SiriOrb from '@/components/smoothui/siri-orb';
import { AppSwitchLottie } from '@/components/AppSwitchLottie';

// Apps with a lottie animation ready under public/lottie/. Apps not listed
// here fall back to the text-only loader (no icon) until an asset is added.
const APP_SWITCH_LOTTIE: Partial<Record<AppId, string>> = {
  burnlog: '/lottie/burnlog.json',
  moneylog: '/lottie/moneylog.json',
  sociallog: '/lottie/sociallog.json',
  travellog: '/lottie/travellog.json',
  adminlog: '/lottie/adminlog.json',
};

function switchIcon(appId: AppId) {
  if (appId === 'intellog') return <SiriOrb state="thinking" size="96px" />;
  const lottiePath = APP_SWITCH_LOTTIE[appId];
  return lottiePath ? <AppSwitchLottie path={lottiePath} /> : undefined;
}

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];

  return (
    <MultiStepLoader
      loading
      duration={APP_SWITCH_STEP_DURATION_MS}
      icon={switchIcon(switchingTo)}
      loadingStates={[
        { text: `Switching to ${app.name}…` },
        ...APP_SWITCH_LOADING_STATES[switchingTo],
      ]}
    />
  );
}
