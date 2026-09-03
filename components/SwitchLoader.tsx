// components/SwitchLoader.tsx
'use client';

import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';
import {
  APP_SWITCH_LOADING_STATES,
  APP_SWITCH_STEP_DURATION_MS,
} from '@/lib/appSwitchLoadingStates';
import { MultiStepLoader } from '@/components/ui/multi-step-loader';
import SiriOrb from '@/components/smoothui/siri-orb';

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];

  return (
    <MultiStepLoader
      loading
      duration={APP_SWITCH_STEP_DURATION_MS}
      icon={switchingTo === 'intellog' ? <SiriOrb state="thinking" size="96px" /> : undefined}
      loadingStates={[
        { text: `Switching to ${app.name}…` },
        ...APP_SWITCH_LOADING_STATES[switchingTo],
      ]}
    />
  );
}
